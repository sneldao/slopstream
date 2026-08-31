import { describe, expect, it } from "vitest";

import {
  cleanCompanyName,
  pickTagline,
  preferBestSubmissions,
  sourceForUrl,
  toSubmission,
  CompanyScraper,
} from "./scraper.js";

describe("sourceForUrl", () => {
  it("maps known sources", () => {
    expect(sourceForUrl("https://news.ycombinator.com/item?id=1")).toBe(
      "hacker_news",
    );
    expect(sourceForUrl("https://www.producthunt.com/posts/thing")).toBe(
      "product_hunt",
    );
    expect(sourceForUrl("https://www.ycombinator.com/launches/x")).toBe(
      "yc_launch",
    );
    expect(sourceForUrl("https://techcrunch.com/2026/01/01/foo")).toBe("news");
  });
});

describe("cleanCompanyName", () => {
  it("strips site suffixes and Show HN prefixes", () => {
    expect(cleanCompanyName("Acme AI | AI for developers")).toBe("Acme AI");
    expect(cleanCompanyName("Show HN: Acme AI – realtime slop")).toBe(
      "Acme AI – realtime slop",
    );
  });
});

describe("toSubmission", () => {
  it("maps a search result with excerpts", () => {
    const sub = toSubmission({
      url: "https://news.ycombinator.com/item?id=99",
      title: "Show HN: Acme AI",
      excerpts: ["Acme AI makes developers faster. It launched today."],
    });
    expect(sub).toMatchObject({
      name: "Acme AI",
      source: "hacker_news",
      sourceUrl: "https://news.ycombinator.com/item?id=99",
      description: "Acme AI makes developers faster. It launched today.",
    });
  });

  it("rejects aggregator/login pages and empty results", () => {
    expect(
      toSubmission({ url: "https://news.ycombinator.com", title: "Sign in" }),
    ).toBeNull();
    expect(toSubmission({ url: "", title: "x" })).toBeNull();
    expect(toSubmission(undefined as never)).toBeNull();
  });
});

describe("CompanyScraper.runOnce", () => {
  it("searches Parallel and ingests mapped submissions", async () => {
    const ingested: unknown[][] = [];
    let calls = 0;
    const scraper = new CompanyScraper({
      apiKey: "test-key",
      maxResults: 5,
      ingest: async (companies) => {
        ingested.push(companies);
      },
      fetcher: (async () => {
        calls += 1;
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                url: "https://www.producthunt.com/posts/acme",
                title: "Acme AI | Ship faster",
                excerpts: ["Acme AI is an AI code reviewer."],
              },
            ],
          }),
        } as unknown as Response;
      }) as typeof fetch,
    });

    await scraper.runOnce();
    expect(calls).toBe(1);
    expect(ingested).toEqual([
      [
        expect.objectContaining({
          name: "Acme AI",
          source: "product_hunt",
        }),
      ],
    ]);
  });

  it("swallows search failures without throwing", async () => {
    const scraper = new CompanyScraper({
      apiKey: "test-key",
      maxResults: 5,
      ingest: async () => {},
      fetcher: (async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch,
    });
    await expect(scraper.runOnce()).resolves.toBeUndefined();
  });
});

describe("pickTagline", () => {
  it("uses the first sentence when it reads as product copy", () => {
    expect(
      pickTagline("Acme AI reviews pull requests automatically. It is fast."),
    ).toBe("Acme AI reviews pull requests automatically.");
  });

  it("skips a founder-narrative first sentence", () => {
    expect(
      pickTagline(
        "Hi HN, I've been working on this for two years. Acme AI automates invoicing for freelancers.",
      ),
    ).toBe("Acme AI automates invoicing for freelancers.");
  });

  it("returns undefined when both opening sentences are narrative", () => {
    expect(
      pickTagline(
        "So we built this because we were frustrated. I built it after years of pain.",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for empty excerpts", () => {
    expect(pickTagline("")).toBeUndefined();
  });
});

describe("preferBestSubmissions", () => {
  it("keeps the product-hunt page over the HN discussion for one company", () => {
    const hn = {
      name: "Acme AI",
      source: "hacker_news" as const,
      sourceUrl: "https://news.ycombinator.com/item?id=1",
    };
    const ph = {
      name: "acme-ai",
      source: "product_hunt" as const,
      sourceUrl: "https://www.producthunt.com/posts/acme-ai",
    };
    expect(preferBestSubmissions([hn, ph])).toEqual([ph]);
    expect(preferBestSubmissions([ph, hn])).toEqual([ph]);
  });

  it("keeps distinct companies untouched", () => {
    const a = {
      name: "Acme AI",
      source: "hacker_news" as const,
      sourceUrl: "https://news.ycombinator.com/item?id=1",
    };
    const b = {
      name: "Beta Labs",
      source: "news" as const,
      sourceUrl: "https://techcrunch.com/beta",
    };
    expect(preferBestSubmissions([a, b])).toEqual([a, b]);
  });
});
