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

/** Turn one Parallel search result into a scraped-company submission. */
export function toSubmission(
  result: ParallelSearchResult,
): ScrapedCompanySubmission | null {
  if (!result?.url || !result?.title) return null;
  const excerpt = (result.excerpts ?? []).join(" ").trim();
  // Skip obvious non-company pages (aggregators, login walls).
  if (/sign in|log in|comments|discussion/i.test(result.title)) return null;
  const tagline = excerpt.split(/(?<=[.!?])\s/)[0]?.slice(0, 200) || undefined;
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
      const submissions = results
        .map(toSubmission)
        .filter((s): s is ScrapedCompanySubmission => s !== null);
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
