import { describe, expect, it } from "vitest";
import {
  FORMATS,
  MAX_SCRIPT_WORDS,
  marketSting,
  truncateWords,
} from "./creativeFormats.js";

describe("truncateWords", () => {
  it("keeps short text intact", () => {
    expect(truncateWords("Hello world", 5)).toBe("Hello world");
  });

  it("cuts long text at the word budget", () => {
    const long =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    expect(truncateWords(long, 4)).toBe("alpha beta gamma delta.");
  });
});

describe("marketSting", () => {
  it("adds heat copy when the market is competitive", () => {
    expect(marketSting({ leaderAmountUsd: 35 })).toContain("hot");
    expect(marketSting({ nextSlotPriceUsd: 22 })).toContain("moving");
    expect(marketSting({ attentionProgress: 1 })).toContain("proved");
  });
});

describe("creative format scripts", () => {
  it("stay within the spoken word budget even with a long brief", () => {
    const brief = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    for (const format of FORMATS) {
      const script = format.script({
        brand: "Acme",
        brief,
        context: "previous ad about robots",
      });
      const words = script.trim().split(/\s+/).filter(Boolean);
      expect(words.length).toBeLessThanOrEqual(MAX_SCRIPT_WORDS);
    }
  });
});
