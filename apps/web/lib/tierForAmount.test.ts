import { describe, expect, it } from "vitest";
import { tierForAmount, tierMin } from "./tierForAmount";

describe("tierForAmount", () => {
  it("maps bid amounts to production tiers", () => {
    expect(tierForAmount(1)).toBe("audio");
    expect(tierForAmount(5)).toBe("audio_image");
    expect(tierForAmount(20)).toBe("video");
    expect(tierForAmount(50)).toBe("premium");
    expect(tierForAmount(100)).toBe("premium");
  });

  it("exposes tier minimums for jump-to-bid", () => {
    expect(tierMin("video")).toBe(20);
    expect(tierMin("premium")).toBe(50);
  });
});
