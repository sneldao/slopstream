import { describe, expect, it } from "vitest";
import {
  continuityFromResult,
  marketContextFromSnapshot,
} from "./marketContext.js";

const audio = {
  url: "https://cdn.test/seg_1.mp3",
  contentType: "audio/mpeg",
  sha256: "a".repeat(64),
};

describe("marketContextFromSnapshot", () => {
  it("maps leaderboard and attention into generation context", () => {
    const ctx = marketContextFromSnapshot({
      asOfSequence: 1,
      nowPlaying: null,
      recentSegments: [],
      upcomingSegments: [],
      brands: [],
      leaderboard: [{ brandId: "brand_acme", amountUsd: 42 }],
      nextSlotPriceUsd: 25,
      currentAuction: { slot: 4, closesAt: new Date().toISOString() },
      listeners: 2,
      attentionProofs: 3,
      listenerRewardsUsd: 0,
      nowPlayingAttentionThreshold: 6,
      placedVolumeUsd: 0,
      totalClearedVolumeUsd: 0,
    });

    expect(ctx).toMatchObject({
      leaderBrandId: "brand_acme",
      leaderAmountUsd: 42,
      openSlot: 4,
      nextSlotPriceUsd: 25,
      verifiedCount: 3,
      attentionThreshold: 6,
      attentionProgress: 0.5,
    });
  });
});

describe("continuityFromResult", () => {
  it("prefers heroImageUrl from visual metadata", () => {
    expect(
      continuityFromResult({
        segmentId: "seg_1",
        assetUrl: "https://cdn.test/seg_1.mp4",
        media: {
          version: 1,
          durationSec: 10,
          audio,
          visual: {
            url: "https://cdn.test/seg_1.mp4",
            contentType: "video/mp4",
            sha256: "b".repeat(64),
            type: "video",
            posterUrl: "https://cdn.test/seg_1.png",
          },
        },
        durationSec: 10,
        transcript: "t",
        summary: "s",
        visualMetadata: { heroImageUrl: "https://cdn.test/seg_1.png" },
      }),
    ).toBe("https://cdn.test/seg_1.png");
  });

  it("falls back to image asset URLs", () => {
    expect(
      continuityFromResult({
        segmentId: "seg_1",
        assetUrl: "https://cdn.test/seg_1.webp",
        media: {
          version: 1,
          durationSec: 10,
          audio,
          visual: {
            url: "https://cdn.test/seg_1.webp",
            contentType: "image/webp",
            sha256: "c".repeat(64),
            type: "image",
          },
        },
        durationSec: 10,
        transcript: "t",
        summary: "s",
      }),
    ).toBe("https://cdn.test/seg_1.webp");
  });
});
