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
  recentSegments: [],
  upcomingSegments: [],
  nowPlayingAttentionThreshold: 2,
  brands: [],
  leaderboard: [{ brandId: "brand_1", amountUsd: 10 }],
  nextSlotPriceUsd: 11,
  listeners: 3,
  attentionProofs: 1,
  listenerRewardsUsd: 0,
  totalClearedVolumeUsd: 0,
  placedVolumeUsd: 0,
};

describe("streamReducer live lifecycle", () => {
  it("hydrates cumulative market totals from a reconnect snapshot", () => {
    const state = snapshotToState({
      ...snapshot,
      placedVolumeUsd: 125,
      totalClearedVolumeUsd: 80,
      latestClearedBid: {
        bidId: "bid_1",
        segmentId: "seg_1",
        grossAmountUsd: 80,
        listenerPoolUsd: 64,
        platformRevenueUsd: 16,
        explanation: "Recovered cleared-bid explanation.",
        clearedAt: "2026-08-31T00:00:00.000Z",
      },
    });

    expect(state.placedVolumeUsd).toBe(125);
    expect(state.totalClearedVolumeUsd).toBe(80);
    expect(state.lastClear).toMatchObject({
      burstId: 0,
      explanation: "Recovered cleared-bid explanation.",
    });
    expect(state.lastSettlement).toMatchObject({
      kind: "cleared",
      flashId: 0,
      explanation: "Recovered cleared-bid explanation.",
    });
  });

  it("updates placed volume from a live bid event", () => {
    const state = reduceStreamEvent(snapshotToState(snapshot), {
      type: "bid.placed",
      bidId: "bid_2",
      brandId: "brand_2",
      amountUsd: 12.5,
      slot: 2,
    });

    expect(state.placedVolumeUsd).toBe(12.5);
  });

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
      explanation:
        "Won at $10.00: video production, cleared against 2 verified attention events; $8.00 allocated across verified listener rewards.",
    });

    expect(state.nowPlaying).toBeNull();
    expect(state.recentSegments[0]).toMatchObject({
      id: "seg_1",
      status: "done",
    });
    expect(state.attention).toBeUndefined();
    expect(state.lastClear?.grossAmountUsd).toBe(10);
    expect(state.totalClearedVolumeUsd).toBe(10);
    expect(state.recentSegments[0]?.clearedAmountUsd).toBe(10);
    expect(state.lastSettlement).toMatchObject({
      kind: "cleared",
      amountUsd: 10,
      listenerPoolUsd: 8,
      explanation:
        "Won at $10.00: video production, cleared against 2 verified attention events; $8.00 allocated across verified listener rewards.",
    });
  });

  it("records returned spend when a bid misses the threshold", () => {
    const state = reduceStreamEvent(snapshotToState(snapshot), {
      type: "bid.uncleared",
      bidId: "bid_1",
      segmentId: "seg_1",
      returnedAmountUsd: 10,
    });

    expect(state.nowPlaying).toBeNull();
    expect(state.lastSettlement).toMatchObject({
      kind: "uncleared",
      amountUsd: 10,
    });
  });
});

describe("streamReducer encore replays", () => {
  const encoreEvent = {
    type: "segment.encore",
    segmentId: "seg_old",
    brandId: "brand_old",
    startedAt: "2026-08-30T21:00:00.000Z",
    slot: 3,
    assetUrl: "https://cdn.test/seg_old.mp4",
    durationSec: 20,
    summary: "encore summary",
  } as const;

  it("projects an encore as now-playing and flags it", () => {
    const base = snapshotToState({ ...snapshot, nowPlaying: null });
    const withGeneration = reduceStreamEvent(base, {
      type: "segment.generating",
      segmentId: "seg_next",
      slot: 4,
      tier: "audio",
      brandId: "brand_2",
    });
    const state = reduceStreamEvent(withGeneration, encoreEvent);

    expect(state.nowPlaying).toMatchObject({
      id: "seg_old",
      slot: 3,
      brandId: "brand_old",
      assetUrl: "https://cdn.test/seg_old.mp4",
      durationSeconds: 20,
      status: "playing",
    });
    expect(state.nowPlayingEncore).toBe(true);
    expect(state.nowPlayingStartedAt).toBe("2026-08-30T21:00:00.000Z");
    // A concurrent generation keeps running behind the encore.
    expect(state.generation?.segmentId).toBe("seg_next");
    expect(state.playingTier).toBeUndefined();
  });

  it("a live segment supersedes the encore and clears the flag", () => {
    let state = reduceStreamEvent(
      snapshotToState({ ...snapshot, nowPlaying: null }),
      encoreEvent,
    );
    state = reduceStreamEvent(state, {
      type: "segment.playing",
      segmentId: "seg_live",
      brandId: "brand_live",
      startedAt: "2026-08-30T21:01:00.000Z",
    });

    expect(state.nowPlaying?.id).toBe("seg_live");
    expect(state.nowPlayingEncore).toBeUndefined();
    // The encore is archived into the history.
    expect(state.recentSegments[0]).toMatchObject({
      id: "seg_old",
      status: "done",
    });
  });

  it("a snapshot refetch resets the encore flag", () => {
    const state = snapshotToState(snapshot);
    expect(state.nowPlayingEncore).toBeUndefined();
  });

  it("unrelated settlement does not null the encore", () => {
    const state = reduceStreamEvent(
      snapshotToState({ ...snapshot, nowPlaying: null }),
      encoreEvent,
    );
    const after = reduceStreamEvent(state, {
      type: "bid.cleared",
      bidId: "bid_9",
      segmentId: "seg_other",
      grossAmountUsd: 10,
      listenerPoolUsd: 8,
      platformRevenueUsd: 2,
      explanation:
        "Won at $10.00: video production, cleared against 2 verified attention events; $8.00 allocated across verified listener rewards.",
    });
    expect(after.nowPlaying?.id).toBe("seg_old");
    expect(after.nowPlayingEncore).toBe(true);
  });
});
