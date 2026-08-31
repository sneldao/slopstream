import { describe, expect, it } from "vitest";
import { FREE_BRAND_ID, type Segment } from "@slopstream/shared";
import {
  marketIsHot,
  ENCORE_HOT_LEADER_USD,
  ENCORE_HOT_NEXT_SLOT_USD,
} from "./marketContext.js";
import {
  pickEncoreCandidate,
  playoutDurationFor,
  prefetchDepthFor,
  updateEwma,
  type EncoreRing,
} from "./encore.js";

function seg(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    slot: Number(id.split("_")[1] ?? 0),
    brandId: `brand_${id}`,
    assetUrl: `https://cdn.test/${id}.mp4`,
    durationSeconds: 20,
    summary: `summary ${id}`,
    status: "done",
    ...overrides,
  };
}

function ring(overrides: Partial<EncoreRing> = {}): EncoreRing {
  return { encoredAtMs: new Map(), ...overrides };
}

describe("marketIsHot", () => {
  it("is hot when the leader bid reaches the threshold", () => {
    expect(
      marketIsHot({
        leaderboard: [{ brandId: "b1", amountUsd: ENCORE_HOT_LEADER_USD }],
        nextSlotPriceUsd: 0,
      }),
    ).toBe(true);
  });

  it("is hot when the next slot price reaches the threshold", () => {
    expect(
      marketIsHot({
        leaderboard: [{ brandId: "b1", amountUsd: 5 }],
        nextSlotPriceUsd: ENCORE_HOT_NEXT_SLOT_USD,
      }),
    ).toBe(true);
  });

  it("is cold below both thresholds and with an empty leaderboard", () => {
    expect(
      marketIsHot({
        leaderboard: [{ brandId: "b1", amountUsd: ENCORE_HOT_LEADER_USD - 1 }],
        nextSlotPriceUsd: ENCORE_HOT_NEXT_SLOT_USD - 1,
      }),
    ).toBe(false);
    expect(marketIsHot({ leaderboard: [], nextSlotPriceUsd: 0 })).toBe(false);
  });
});

describe("updateEwma", () => {
  it("seeds with the first sample", () => {
    expect(updateEwma(undefined, 5000)).toBe(5000);
  });

  it("smooths subsequent samples", () => {
    const next = updateEwma(10000, 5000, 0.3);
    expect(next).toBeCloseTo(0.3 * 5000 + 0.7 * 10000);
  });
});

describe("prefetchDepthFor", () => {
  it("defaults to 1 with no latency data", () => {
    expect(prefetchDepthFor(undefined, 20)).toBe(1);
  });

  it("is 1 when generation fits inside the play window", () => {
    expect(prefetchDepthFor(15_000, 20)).toBe(1);
  });

  it("grows with generation latency", () => {
    expect(prefetchDepthFor(42_000, 20)).toBe(3);
  });

  it("clamps runaway samples at 3", () => {
    expect(prefetchDepthFor(600_000, 20)).toBe(3);
  });
});

describe("playoutDurationFor", () => {
  it("caps the window to natural media duration without extending it", () => {
    expect(playoutDurationFor(30, 20)).toBe(20);
    expect(playoutDurationFor(3.9, 20)).toBe(3);
    expect(playoutDurationFor(30, 45)).toBe(30);
  });
});

describe("pickEncoreCandidate", () => {
  it("skips segments without an asset and the immediately previous one", () => {
    const recent = [
      seg("seg_3"),
      seg("seg_2", { assetUrl: undefined }),
      seg("seg_1"),
    ];
    const pick = pickEncoreCandidate(
      recent,
      ring({ lastAiredSegmentId: "seg_3" }),
    );
    expect(pick?.id).toBe("seg_1");
  });

  it("prefers never-encored segments, then least recently encored", () => {
    const recent = [seg("seg_3"), seg("seg_2"), seg("seg_1")];
    const r = ring({
      encoredAtMs: new Map([
        ["seg_3", 2000],
        ["seg_2", 1000],
      ]),
    });
    expect(pickEncoreCandidate(recent, r)?.id).toBe("seg_1");

    r.encoredAtMs.set("seg_1", 3000);
    expect(pickEncoreCandidate(recent, r)?.id).toBe("seg_2");
  });

  it("avoids repeating the last encore brand unless no alternative", () => {
    const recent = [seg("seg_2", { brandId: "brand_x" }), seg("seg_1")];
    expect(
      pickEncoreCandidate(recent, ring({ lastEncoreBrandId: "brand_x" }))?.id,
    ).toBe("seg_1");

    const sameBrand = [seg("seg_4", { brandId: "brand_x" })];
    expect(
      pickEncoreCandidate(sameBrand, ring({ lastEncoreBrandId: "brand_x" }))
        ?.id,
    ).toBe("seg_4");
  });

  it("maps free-segment brands through FREE_BRAND_ID for variety", () => {
    const recent = [seg("seg_2", { brandId: null })];
    expect(
      pickEncoreCandidate(recent, ring({ lastEncoreBrandId: FREE_BRAND_ID }))
        ?.id,
    ).toBe("seg_2"); // only candidate — variety penalty cannot empty the list
  });

  it("accepts manifest-only audio when choosing an encore", () => {
    const manifestOnly = seg("seg_1", {
      assetUrl: undefined,
      media: {
        version: 1,
        durationSec: 20,
        audio: {
          url: "https://cdn.test/seg_1.mp3",
          contentType: "audio/mpeg",
          sha256: "a".repeat(64),
        },
      },
    });
    expect(pickEncoreCandidate([manifestOnly], ring())?.id).toBe("seg_1");
  });

  it("returns null when everything is excluded", () => {
    expect(pickEncoreCandidate([], ring())).toBeNull();
    expect(
      pickEncoreCandidate([seg("seg_1", { assetUrl: undefined })], ring()),
    ).toBeNull();
    expect(
      pickEncoreCandidate(
        [seg("seg_1")],
        ring({ lastAiredSegmentId: "seg_1" }),
      ),
    ).toBeNull();
  });
});
