import { describe, expect, it } from "vitest";
import { bidMinimum } from "./bidMinimum";

describe("bidMinimum", () => {
  it("uses the API opening price when no brand is leading", () => {
    expect(bidMinimum(undefined, "brand_acme", 4.99, 5)).toEqual({
      minimumUsd: 5,
      iAmLeading: false,
      isBidTooLow: true,
      isMarketPriceAvailable: true,
    });
  });

  it("requires the current leader to raise above its standing bid", () => {
    expect(
      bidMinimum(
        { brandId: "brand_acme", amountUsd: 10 },
        "brand_acme",
        10,
        11,
      ),
    ).toMatchObject({
      minimumUsd: 11,
      iAmLeading: true,
      isBidTooLow: true,
    });
  });

  it("applies the same increment to a competing brand", () => {
    expect(
      bidMinimum(
        { brandId: "brand_other", amountUsd: 10 },
        "brand_acme",
        10.01,
        11,
      ),
    ).toMatchObject({
      minimumUsd: 11,
      iAmLeading: false,
      isBidTooLow: true,
    });
  });

  it("keeps a server-projected fractional minimum intact", () => {
    expect(
      bidMinimum(
        { brandId: "brand_other", amountUsd: 10.25 },
        "brand_acme",
        11.25,
        11.25,
      ),
    ).toMatchObject({
      minimumUsd: 11.25,
      isBidTooLow: false,
    });
  });
});
