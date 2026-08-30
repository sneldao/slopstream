import { describe, expect, it } from "vitest";

import {
  cleanCompanyName,
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
