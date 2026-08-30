import { describe, expect, it } from "vitest";
import { OPENING_PRICE_CENTS, tierForAmount } from "./auction.js";
import { ApiError } from "./money.js";
import { fundedBrand, setupHarness } from "./test-harness.js";
import { FREE_BRAND_ID } from "@slopstream/shared";

describe("tierForAmount", () => {
  it("maps amounts to tier boundaries", () => {
    expect(tierForAmount(499)).toBe("audio"); // $4.99
    expect(tierForAmount(500)).toBe("audio_image"); // $5
    expect(tierForAmount(1999)).toBe("audio_image");
    expect(tierForAmount(2000)).toBe("video"); // $20
    expect(tierForAmount(4999)).toBe("video");
    expect(tierForAmount(5000)).toBe("premium"); // $50
  });
});

describe("auction reservations", () => {
  it("reserves the bid amount from available balance", () => {
    const h = setupHarness();
    const brand = fundedBrand(h, "A", 100);
    h.auction.placeBid(brand, 10);
    const balance = h.ledger.balances.get(brand.id)!;
    expect(balance.availableCents).toBe(9000);
    expect(balance.reservedCents).toBe(1000);
  });

  it("raising your own standing bid reserves only the delta", () => {
    const h = setupHarness();
    const brand = fundedBrand(h, "A", 100);
    h.auction.placeBid(brand, 10);
    h.auction.placeBid(brand, 15);
    const balance = h.ledger.balances.get(brand.id)!;
    expect(balance.reservedCents).toBe(1500);
    expect(balance.availableCents).toBe(8500);
    // Same bid row is raised in place.
    expect(h.ledger.pendingBidsForSlot(1)).toHaveLength(1);
  });

  it("an outbid releases the displaced brand's reservation", () => {
    const h = setupHarness();
    const a = fundedBrand(h, "A", 100);
    const b = fundedBrand(h, "B", 100);
    h.auction.placeBid(a, 10);
    const { outbid } = h.auction.placeBid(b, 12);
    expect(outbid?.brandId).toBe(a.id);
    expect(h.ledger.balances.get(a.id)).toMatchObject({
      availableCents: 10000,
      reservedCents: 0,
    });
    expect(h.ledger.balances.get(b.id)).toMatchObject({
      availableCents: 8800,
      reservedCents: 1200,
    });
    const outbidEvent = h.events.find((e) => e.type === "bid.outbid");
    expect(outbidEvent).toBeDefined();
    expect(outbidEvent).toMatchObject({ newAmountUsd: 12, prevAmountUsd: 10 });
  });

  it("rejects bids below the current minimum", () => {
    const h = setupHarness();
    const a = fundedBrand(h, "A", 100);
    const b = fundedBrand(h, "B", 100);
    expect(() => h.auction.placeBid(a, 4.99)).toThrow(ApiError); // below $5 opening
    h.auction.placeBid(a, 10);
    expect(() => h.auction.placeBid(b, 10.5)).toThrow(ApiError); // below $11 (standing + $1)
  });

  it("rejects bids the balance cannot cover", () => {
    const h = setupHarness();
    const a = fundedBrand(h, "A", 10);
    expect(() => h.auction.placeBid(a, 50)).toThrow(ApiError);
  });

  it("auto-sweeps an overdue auction when placing a bid", () => {
    const h = setupHarness();
    const a = fundedBrand(h, "A", 100);
    h.auction.ensureOpenAuction(); // opens at t0 + 60s
    h.setTime(1_000_000_000 + 61_000);
    const { bid } = h.auction.placeBid(a, 10);
    expect(h.auction.auctionForSlot(1)?.status).toBe("closed");
    expect(bid.slot).toBe(2);
  });
});

describe("overdue auction sweep", () => {
  it("closes an overdue open auction when ensureOpenAuction is called", () => {
    const h = setupHarness();
    h.auction.ensureOpenAuction();
    expect(h.auction.openAuction()?.slot).toBe(1);
    h.setTime(1_000_000_000 + 61_000);
    const next = h.auction.ensureOpenAuction();
    expect(next.slot).toBe(2);
    expect(h.auction.auctionForSlot(1)?.status).toBe("closed");
  });

  it("routes new bids to the next slot after a sweep", () => {
    const h = setupHarness();
    const brand = fundedBrand(h, "A", 100);
    h.auction.ensureOpenAuction();
    h.setTime(1_000_000_000 + 61_000);
    h.auction.ensureOpenAuction();
    const { bid } = h.auction.placeBid(brand, 10);
    expect(bid.slot).toBe(2);
  });
});

describe("auction close", () => {
  it("marks the winner won, releases losers, realizes a segment, and reopens", () => {
    const h = setupHarness();
    const a = fundedBrand(h, "A", 100);
    const b = fundedBrand(h, "B", 100);
    h.auction.placeBid(a, 10);
    h.auction.placeBid(b, 8 + 5); // B is standing first; A outbids
    h.auction.placeBid(a, 15);

    const winner = h.auction.closeAuction(1);
    expect(winner?.brandId).toBe(a.id);
    expect(winner?.status).toBe("won");
    expect(winner?.segmentId).toBeDefined();

    // Losers refunded.
    expect(h.ledger.balances.get(b.id)).toMatchObject({
      availableCents: 10000,
      reservedCents: 0,
    });
    // Winner's reservation still held until clearing.
    expect(h.ledger.balances.get(a.id)).toMatchObject({ reservedCents: 1500 });

    // Segment realized with the frozen threshold fraction.
    const segment = h.ledger.segments.get(winner!.segmentId!)!;
    expect(segment.slot).toBe(1);
    expect(segment.bidId).toBe(winner!.id);
    expect(segment.thresholdFraction).toBe(0.6);

    // The next auction is already open for slot 2.
    expect(h.auction.openAuction()?.slot).toBe(2);
  });

  it("opening price is the floor and the slot still reopens with no bids", () => {
    const h = setupHarness();
    fundedBrand(h, "A", 100);
    const auction = h.auction.ensureOpenAuction();
    expect(auction.openingCents).toBe(OPENING_PRICE_CENTS);
    expect(h.auction.closeAuction(1)).toBeNull();

    expect(h.auction.openAuction()?.slot).toBe(2);
    expect(h.ledger.segments.size).toBe(0);
  });
});

describe("free (scraped) segments — cold-start engine", () => {
  it("closes a no-bid slot as a free segment when a scraped company exists", () => {
    const h = setupHarness();
    const { added } = h.ledger.insertScrapedCompanies([
      {
        name: "Acme AI",
        source: "product_hunt",
        sourceUrl: "https://www.producthunt.com/posts/acme",
        tagline: "AI code review",
      },
    ]);
    expect(added).toBe(1);

    h.auction.ensureOpenAuction();
    expect(h.auction.closeAuction(1)).toBeNull(); // no winner

    const free = h.auction.freeSegmentForSlot(1);
    expect(free).toBeDefined();
    expect(free!.brandId).toBeNull();
    expect(free!.bidId).toBeNull();
    expect(free!.brief).toContain("Acme AI");
    expect(free!.brief).toContain("unofficial AI-generated parody");

    // The company is consumed exactly once.
    const company = h.ledger.scrapedCompanies.get(free!.scrapedCompanyId!)!;
    expect(company.usedAtMs).toBeDefined();

    // The orchestrator read shape exposes the free segment for driving.
    const state = h.auction.auctionState(1)!;
    expect(state.winner).toBeUndefined();
    expect(state.freeSegment).toMatchObject({
      segmentId: free!.id,
      companyName: "Acme AI",
      tier: "audio",
    });

    // The free pseudo-brand is registered for client palette resolution.
    expect(h.ledger.brands.has(FREE_BRAND_ID)).toBe(true);
  });

  it("a no-bid slot without scraped companies produces nothing", () => {
    const h = setupHarness();
    h.auction.ensureOpenAuction();
    expect(h.auction.closeAuction(1)).toBeNull();
    expect(h.auction.freeSegmentForSlot(1)).toBeUndefined();
    const state = h.auction.auctionState(1)!;
    expect(state.freeSegment).toBeUndefined();
  });

  it("dedupes scraped companies by sourceUrl and (source, name)", () => {
    const h = setupHarness();
    const first = h.ledger.insertScrapedCompanies([
      {
        name: "Acme AI",
        source: "hacker_news",
        sourceUrl: "https://news.ycombinator.com/item?id=1",
      },
    ]);
    const second = h.ledger.insertScrapedCompanies([
      {
        name: "Acme AI",
        source: "hacker_news",
        sourceUrl: "https://news.ycombinator.com/item?id=1",
      },
      {
        name: "acme ai",
        source: "hacker_news",
        sourceUrl: "https://news.ycombinator.com/item?id=2",
      },
    ]);
    expect(first).toEqual({ added: 1, duplicates: 0 });
    expect(second).toEqual({ added: 0, duplicates: 2 });
    expect(h.ledger.scrapedCompanies.size).toBe(1);
  });
});
