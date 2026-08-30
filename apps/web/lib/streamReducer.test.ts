import type { StreamSnapshot } from "@slopstream/shared";
import { describe, expect, it } from "vitest";

import { reduceStreamEvent, snapshotToState } from "./streamReducer";

const snapshot: StreamSnapshot = {
  asOfSequence: 4,
  nowPlaying: {
    id: "seg_1",
    slot: 1,
    brandId: "brand_1",
    durationSeconds: 30,
    summary: "",
    status: "playing",
  },
  nowPlayingAttentionThreshold: 2,
  brands: [],
  leaderboard: [{ brandId: "brand_1", amountUsd: 10 }],
  nextSlotPriceUsd: 11,
  listeners: 3,
  attentionProofs: 1,
  listenerRewardsUsd: 0,
};

describe("streamReducer live lifecycle", () => {
  it("projects a newly opened auction and clears the old leaderboard", () => {
    const state = reduceStreamEvent(snapshotToState(snapshot), {
      type: "auction.opened",
      slot: 2,
      closesAt: "2026-08-30T16:00:00.000Z",
      nextSlotPriceUsd: 5,
    });

    expect(state.currentAuction).toEqual({
      slot: 2,
      closesAt: "2026-08-30T16:00:00.000Z",
    });
    expect(state.nextSlotPriceUsd).toBe(5);
    expect(state.leaderboard).toEqual([]);
  });

  it("removes a segment from now-playing after settlement", () => {
    const state = reduceStreamEvent(snapshotToState(snapshot), {
      type: "bid.cleared",
      bidId: "bid_1",
      segmentId: "seg_1",
      grossAmountUsd: 10,
      listenerPoolUsd: 8,
      platformRevenueUsd: 2,
    });

    expect(state.nowPlaying).toBeNull();
    expect(state.attention).toBeUndefined();
    expect(state.lastClear?.grossAmountUsd).toBe(10);
  });
});
