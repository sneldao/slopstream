// Cold-start company scraper (docs/product/content.md — "Free AI-generated
// ads (cold-start engine)"). Uses the Parallel Search API
// (https://docs.parallel.ai) to discover recently launched companies from
// Hacker News, Product Hunt, YC launches, and the broader startup press,
// then ingests them into Lane 2 via POST /companies/scraped. The auction
// engine consumes the queue for free filler segments whenever a slot closes
// with no bids.
//
// Implemented against the Parallel Search REST endpoint directly
// (POST https://api.parallel.ai/v1/search, `x-api-key` header) rather than
// the SDK, matching the fetch-based style of the rest of the codebase.

import type {
  ScrapedCompanySource,
  ScrapedCompanySubmission,
} from "@slopstream/shared";

export const PARALLEL_SEARCH_URL = "https://api.parallel.ai/v1/search";
/** External search API — generous but bounded; aborts surface as a normal
 *  discovery-pass failure in runOnce's catch. */
const SEARCH_TIMEOUT_MS = 20_000;

export interface ParallelSearchResult {
  url: string;
  title: string;
  publish_date?: string | null;
  excerpts?: string[];
}

export interface ParallelSearchResponse {
  results?: ParallelSearchResult[];
}

const SEARCH_OBJECTIVE =
  "Find companies that very recently launched or shipped a new product — " +
  "Show HN posts, Product Hunt launches, YC launches, and startup funding " +
  "or product announcements from the last few days. Prefer the companies' " +
  "own pages and launch pages over news aggregators.";

const SEARCH_QUERIES = [
  "Show HN launch this week",
  "Product Hunt new launch",
  "startup product launch announcement",
];

/** Map a result URL to its ScrapedCompanySource. */
export function sourceForUrl(url: string): ScrapedCompanySource {
  const lower = url.toLowerCase();
  if (lower.includes("news.ycombinator.com")) return "hacker_news";
  if (lower.includes("producthunt.com")) return "product_hunt";
  if (lower.includes("ycombinator.com")) return "yc_launch";
  return "news";
}

/** Strip common site-name suffixes from search-result titles. */
export function cleanCompanyName(title: string): string {
  return title
    .replace(/^\s*Show HN\s*:?\s*/i, "")
    .replace(/\s*[|·]\s*[^|·]*$/, "")
    .trim();
}

/**
 * Source ranking for deduping the same company found on multiple pages —
 * the company's own launch/news pages carry real product copy, while HN
 * discussion pages carry founder narrative. Lower rank wins.
 */
export const SOURCE_PREFERENCE: Record<ScrapedCompanySource, number> = {
  product_hunt: 0,
  yc_launch: 1,
  news: 2,
  hacker_news: 3,
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Keep only the best-ranked source per company name. */
export function preferBestSubmissions(
  submissions: ScrapedCompanySubmission[],
): ScrapedCompanySubmission[] {
  const best = new Map<string, ScrapedCompanySubmission>();
  for (const submission of submissions) {
    const key = normalizeName(submission.name);
    if (!key) continue;
    const current = best.get(key);
    if (
      !current ||
      SOURCE_PREFERENCE[submission.source] < SOURCE_PREFERENCE[current.source]
    ) {
      best.set(key, submission);
    }
  }
  return [...best.values()];
}

/** First-person launch narrative — not a product description. */
const narrativePattern =
  /^(hi|hey|hello|so)\b.*\b(i|we)\b|show hn|been working|(i|we) built|(i|we) launched|just launched/i;

/**
 * Pick a tagline from a cleaned excerpt. If the first sentence is founder
 * narrative ("Hi HN, I've been working on…"), prefer the second; if that is
 * also narrative or missing, return undefined so the auction falls back to
 * the full description.
 */
export function pickTagline(excerpt: string): string | undefined {
  const sentences = excerpt
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  for (const sentence of sentences.slice(0, 2)) {
    if (!narrativePattern.test(sentence)) {
      return sentence.slice(0, 200);
    }
  }
  return undefined;
}

/**
 * Strip markdown, URLs, table pipes, and HN page chrome from scraped excerpts
 * so the resulting description reads as clean copy for both TTS and image
 * prompts. Without this, raw HN page content (markdown tables, user links,
 * nav text) leaks into the ad brief.
 */
export function cleanExcerpt(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → label
    .replace(/https?:\/\/\S+/g, "") // bare URLs
    .replace(/\|/g, " ") // table pipes
    .replace(/^[\s:-]+$/gm, "") // table separators / lone dashes
    .replace(/^#+\s+/gm, "") // markdown headers
    .replace(/\bShow HN\b:?\s*/gi, "") // HN prefix
    .replace(/\b\d+\s+points?\s+by\s+\S+/gi, "") // HN "14 points by user"
    .replace(/\bon\s+\w+\s+\d+,?\s+\d{4}\b/gi, "") // HN "on Jan 31, 2025"
    .replace(/\b\d+\s+comments?\b/gi, "") // HN "14 comments"
    .replace(/\bhide\b/gi, "") // HN nav link
    .replace(/\bdiscussion\b/gi, "") // HN nav link
    .replace(/\s+/g, " ")
    .trim();
}

/** Turn one Parallel search result into a scraped-company submission. */
export function toSubmission(
  result: ParallelSearchResult,
): ScrapedCompanySubmission | null {
  if (!result?.url || !result?.title) return null;
  const rawExcerpt = (result.excerpts ?? []).join(" ").trim();
  const excerpt = cleanExcerpt(rawExcerpt);
  // Skip obvious non-company pages (aggregators, login walls).
  if (/sign in|log in|comments|discussion/i.test(result.title)) return null;
  const tagline = pickTagline(excerpt);
  return {
    name: cleanCompanyName(result.title).slice(0, 120),
    source: sourceForUrl(result.url),
    sourceUrl: result.url,
    ...(tagline ? { tagline } : {}),
    ...(excerpt ? { description: excerpt.slice(0, 600) } : {}),
  };
}

export interface ScraperDeps {
  apiKey: string;
  maxResults: number;
  ingest: (companies: ScrapedCompanySubmission[]) => Promise<void>;
  fetcher?: typeof fetch;
  now?: () => number;
}

export class CompanyScraper {
  private readonly deps: ScraperDeps;
  private timer?: NodeJS.Timeout;
  private stopped = true;
  private running = false;

  constructor(deps: ScraperDeps) {
    this.deps = deps;
  }

  start(pollMs: number): void {
    this.stopped = false;
    console.log(
      `[scraper] polling Parallel Search every ${Math.round(pollMs / 1000)}s`,
    );
    void this.runOnce();
    this.schedule(pollMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(pollMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => this.schedule(pollMs));
    }, pollMs);
    this.timer.unref();
  }

  /** One discovery pass: search → map → ingest. Errors never crash the loop. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const results = await this.search();
      const submissions = preferBestSubmissions(
        results
          .map(toSubmission)
          .filter((s): s is ScrapedCompanySubmission => s !== null),
      );
      if (submissions.length === 0) return;
      await this.deps.ingest(submissions);
    } catch (error) {
      console.warn("[scraper] discovery pass failed:", error);
    } finally {
      this.running = false;
    }
  }

  private async search(): Promise<ParallelSearchResult[]> {
    const res = await (this.deps.fetcher ?? fetch)(PARALLEL_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.deps.apiKey,
      },
      body: JSON.stringify({
        objective: SEARCH_OBJECTIVE,
        search_queries: SEARCH_QUERIES,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Parallel Search responded ${res.status}`);
    }
    const body = (await res.json()) as ParallelSearchResponse;
    return body.results ?? [];
  }
}
