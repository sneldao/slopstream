import { describe, expect, it } from "vitest";
import { ApiError, centsToUsd, splitCents, usdToCents } from "./money.js";
import { distributeCents } from "./clearing.js";

describe("usdToCents / centsToUsd", () => {
  it("round-trips clean amounts", () => {
    expect(usdToCents(25)).toBe(2500);
    expect(usdToCents(0.1)).toBe(10);
    expect(centsToUsd(2500)).toBe(25);
    expect(centsToUsd(1)).toBe(0.01);
  });

  it("rounds sub-cent wire amounts to the nearest cent", () => {
    expect(usdToCents(19.999)).toBe(2000);
  });

  it("rejects negative and non-finite input", () => {
    expect(() => usdToCents(-1)).toThrow(ApiError);
    expect(() => usdToCents(Number.NaN)).toThrow(ApiError);
    expect(() => usdToCents(Number.POSITIVE_INFINITY)).toThrow(ApiError);
  });
});

describe("splitCents", () => {
  it("splits without float drift", () => {
    expect(splitCents(2500, 0.8)).toBe(2000);
    expect(splitCents(1000, 0.8)).toBe(800);
    expect(splitCents(333, 0.8)).toBe(266); // 266.4 rounds to 266
  });
});

describe("distributeCents", () => {
  it("sums exactly to the total for equal weights", () => {
    const shares = distributeCents(100, [
      { key: "a", weight: 1 },
      { key: "b", weight: 1 },
      { key: "c", weight: 1 },
    ]);
    const values = [...shares.values()];
    expect(values.reduce((s, v) => s + v, 0)).toBe(100);
    // 100 / 3 = 33.33…: two get 33, one gets 34.
    expect(values.sort((a, b) => a - b)).toEqual([33, 33, 34]);
  });

  it("hands the leftover to the largest remainders", () => {
    // Weights 1:1:1 over 10 cents -> remainders all .33, first keys win ties.
    const shares = distributeCents(10, [
      { key: "a", weight: 1 },
      { key: "b", weight: 1 },
      { key: "c", weight: 1 },
    ]);
    expect(shares.get("a")! + shares.get("b")! + shares.get("c")!).toBe(10);
  });

  it("respects unequal weights", () => {
    const shares = distributeCents(2000, [
      { key: "hard", weight: 3 },
      { key: "easy", weight: 1 },
    ]);
    expect(shares.get("hard")).toBe(1500);
    expect(shares.get("easy")).toBe(500);
  });

  it("returns zero for every key when the pool is empty or weights vanish", () => {
    expect([...distributeCents(0, [{ key: "a", weight: 1 }]).values()]).toEqual(
      [0],
    );
    expect([
      ...distributeCents(100, [{ key: "a", weight: 0 }]).values(),
    ]).toEqual([0]);
  });
});
