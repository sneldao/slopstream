import { describe, expect, it } from "vitest";
import { BidProtection } from "./bidProtection.js";
import type { BidRow } from "./ledger.js";

const bid: BidRow = {
  id: "bid_1",
  brandId: "brand_1",
  slot: 1,
  amountCents: 1_000,
  tier: "audio_image",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("BidProtection", () => {
  it("expires idempotency records after their retry retention window", () => {
    let now = 1_000;
    const protection = new BidProtection({
      idempotencyTtlMs: 100,
      now: () => now,
    });
    protection.record("brand_1", "retry", 1_000, bid);
    expect(protection.replay("brand_1", "retry", 1_000)).toBe(bid);

    now += 101;
    expect(protection.replay("brand_1", "retry", 1_000)).toBeUndefined();
  });

  it("bounds retained idempotency records", () => {
    const protection = new BidProtection({ maxIdempotencyEntries: 2 });
    protection.record("brand_1", "first", 1_000, bid);
    protection.record("brand_1", "second", 1_000, bid);
    protection.record("brand_1", "third", 1_000, bid);

    expect(protection.replay("brand_1", "first", 1_000)).toBeUndefined();
    expect(protection.replay("brand_1", "second", 1_000)).toBe(bid);
    expect(protection.replay("brand_1", "third", 1_000)).toBe(bid);
  });
});
