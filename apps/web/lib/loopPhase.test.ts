import { describe, expect, it } from "vitest";
import { deriveLoopPhase } from "./loopPhase";
import type { StreamState } from "./streamReducer";

function base(overrides: Partial<StreamState> = {}): StreamState {
  return {
    asOfSequence: 0,
    nowPlaying: null,
    recentSegments: [],
    upcomingSegments: [],
    brands: [],
    brandById: {},
    leaderboard: [],
    nextSlotPriceUsd: 0,
    listeners: 0,
    attentionProofs: 0,
    listenerRewardsUsd: 0,
    ...overrides,
  };
}

describe("deriveLoopPhase", () => {
  it("defaults to bid when the market is idle", () => {
    expect(deriveLoopPhase(base())).toBe("bid");
  });

  it("shows play during generation or playback", () => {
    expect(
      deriveLoopPhase(
        base({
          generation: {
            slot: 1,
            segmentId: "seg_1",
            brandId: "brand_a",
            tier: "audio",
            doneStages: [],
            ready: false,
          },
        }),
      ),
    ).toBe("play");
    expect(
      deriveLoopPhase(
        base({
          nowPlaying: {
            id: "seg_1",
            slot: 1,
            brandId: "brand_a",
            status: "playing",
            summary: "Demo segment",
            durationSeconds: 30,
          },
        }),
      ),
    ).toBe("play");
  });

  it("shows prove when attention is accumulating", () => {
    expect(
      deriveLoopPhase(
        base({
          nowPlaying: {
            id: "seg_1",
            slot: 1,
            brandId: "brand_a",
            status: "playing",
            summary: "Demo segment",
            durationSeconds: 30,
          },
          attention: { verifiedCount: 1, total: 10, threshold: 3 },
        }),
      ),
    ).toBe("prove");
  });

  it("shows clear once the threshold is met", () => {
    expect(
      deriveLoopPhase(
        base({
          nowPlaying: {
            id: "seg_1",
            slot: 1,
            brandId: "brand_a",
            status: "playing",
            summary: "Demo segment",
            durationSeconds: 30,
          },
          attention: { verifiedCount: 3, total: 10, threshold: 3 },
        }),
      ),
    ).toBe("clear");
  });
});
