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

const media = {
  version: 1 as const,
  durationSec: 30,
  audio: {
    url: "https://cdn.test/seg_1.mp3",
    contentType: "audio/mpeg",
    sha256: "a".repeat(64),
  },
  visual: {
    url: "https://cdn.test/seg_1.mp4",
    contentType: "video/mp4",
    sha256: "b".repeat(64),
    type: "video" as const,
    posterUrl: "https://cdn.test/seg_1.png",
  },
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

  it("carries a validated manifest from ready into live playback", () => {
    const generating = reduceStreamEvent(
      snapshotToState({ ...snapshot, nowPlaying: null }),
      {
        type: "segment.generating",
        segmentId: "seg_1",
        slot: 1,
        tier: "video",
        brandId: "brand_1",
      },
    );
    const ready = reduceStreamEvent(generating, {
      type: "segment.ready",
      segmentId: "seg_1",
      assetUrl: media.visual.url,
      media,
      durationSec: media.durationSec,
    });
    const playing = reduceStreamEvent(ready, {
      type: "segment.playing",
      segmentId: "seg_1",
      brandId: "brand_1",
      startedAt: "2026-08-31T12:00:00.000Z",
    });

    expect(ready.generation?.media).toEqual(media);
    expect(ready.upcomingSegments[0]?.media).toEqual(media);
    expect(playing.nowPlaying?.media).toEqual(media);
    expect(playing.nowPlaying?.assetUrl).toBe(media.visual.url);
  });

  it("retains queued manifest media when a reconnecting client receives playing", () => {
    const readySegment = {
      id: "seg_queued",
      slot: 2,
      brandId: "brand_2",
      assetUrl: media.visual.url,
      media,
      durationSeconds: media.durationSec,
      summary: "Queued segment summary.",
      status: "ready" as const,
    };
    const state = reduceStreamEvent(
      snapshotToState({
        ...snapshot,
        nowPlaying: null,
        upcomingSegments: [readySegment],
      }),
      {
        type: "segment.playing",
        segmentId: "seg_queued",
        brandId: "brand_2",
        startedAt: "2026-08-31T12:00:00.000Z",
        windowOpenedAtMs: "2026-08-31T12:00:00.000Z",
      },
    );

    expect(state.nowPlaying).toMatchObject({
      id: "seg_queued",
      slot: 2,
      brandId: "brand_2",
      assetUrl: media.visual.url,
      media,
      durationSeconds: media.durationSec,
      summary: "Queued segment summary.",
      status: "playing",
      windowOpenedAtMs: Date.parse("2026-08-31T12:00:00.000Z"),
    });
  });

  it("projects ready media without a local generation event", () => {
    const state = reduceStreamEvent(
      snapshotToState({ ...snapshot, nowPlaying: null }),
      {
        type: "segment.ready",
        segmentId: "seg_late",
        assetUrl: media.visual.url,
        media,
        durationSec: media.durationSec,
      },
    );

    expect(state.generation).toBeUndefined();
    expect(state.upcomingSegments[0]).toMatchObject({
      id: "seg_late",
      assetUrl: media.visual.url,
      media,
      durationSeconds: media.durationSec,
      status: "ready",
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
