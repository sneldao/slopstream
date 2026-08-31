import { describe, expect, it } from "vitest";
import { ClearingEngine } from "./clearing.js";
import { composeSnapshot } from "./snapshot.js";
import { setupHarness } from "./test-harness.js";
import type { BidRow, RewardPoolRow, SegmentRow } from "./ledger.js";
import { StubProofVerifier } from "./verifier.js";

describe("composeSnapshot", () => {
  it("returns recent completed segments newest first and omits stale history", () => {
    const harness = setupHarness();
    const clearing = new ClearingEngine(
      harness.ledger,
      harness.bus,
      new StubProofVerifier(),
      { listenerPct: 0.8, platformPct: 0.2 },
    );
    const now = 2_000_000;
    const segment = (id: string, openedAt: number, status: "done" | "failed") =>
      ({
        id,
        slot: openedAt,
        brandId: null,
        bidId: null,
        status,
        durationSec: 20,
        mediaUrl: `/assets/${id}.webp`,
        media: {
          version: 1,
          durationSec: 20,
          audio: {
            url: `https://cdn.test/${id}.mp3`,
            contentType: "audio/mpeg",
            sha256: "a".repeat(64),
          },
          visual: {
            url: `https://cdn.test/${id}.webp`,
            contentType: "image/webp",
            sha256: "b".repeat(64),
            type: "image",
          },
        },
        summary: `${id} summary`,
        thresholdFraction: 0.6,
        windowOpenedAtMs: openedAt,
        windowClosed: true,
      }) as const;

    harness.ledger.segments.set("older", segment("older", now - 2_000, "done"));
    harness.ledger.segments.set("newer", segment("newer", now - 1_000, "done"));
    harness.ledger.segments.set(
      "stale",
      segment("stale", now - 30 * 60_000 - 1, "done"),
    );
    harness.ledger.segments.set(
      "failed",
      segment("failed", now - 500, "failed"),
    );

    const snapshot = composeSnapshot(
      harness.ledger,
      harness.bus,
      harness.auction,
      clearing,
      now,
    );

    expect(snapshot.recentSegments.map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(snapshot.recentSegments[0]).toMatchObject({
      assetUrl: "/assets/newer.webp",
      media: {
        audio: { url: "https://cdn.test/newer.mp3" },
        visual: { url: "https://cdn.test/newer.webp", type: "image" },
      },
      windowOpenedAtMs: now - 1_000,
    });
  });

  it("keeps the latest cleared value-exchange explanation in recovery snapshots", () => {
    const harness = setupHarness();
    const clearing = new ClearingEngine(
      harness.ledger,
      harness.bus,
      new StubProofVerifier(),
      { listenerPct: 0.8, platformPct: 0.2 },
    );
    const clearedAtMs = 2_000_000;
    const bid: BidRow = {
      id: "bid_cleared",
      brandId: "brand_1",
      slot: 1,
      amountCents: 2_500,
      tier: "video",
      status: "cleared",
      segmentId: "seg_cleared",
      createdAt: new Date(clearedAtMs).toISOString(),
      updatedAt: new Date(clearedAtMs).toISOString(),
    };
    const segment: SegmentRow = {
      id: "seg_cleared",
      slot: 1,
      brandId: "brand_1",
      bidId: bid.id,
      status: "done",
      durationSec: 20,
      summary: "cleared summary",
      thresholdFraction: 0.6,
      requiredEvents: 2,
      windowOpenedAtMs: clearedAtMs - 20_000,
      windowClosed: true,
      clearedAmountCents: bid.amountCents,
      clearedAtMs,
    };
    const pool: RewardPoolRow = {
      id: "pool_cleared",
      bidId: bid.id,
      grossCents: bid.amountCents,
      listenerPct: 0.8,
      platformPct: 0.2,
      eligibleCents: 2_000,
      distributedCents: 2_000,
      status: "closed",
      createdAt: new Date(clearedAtMs).toISOString(),
    };
    harness.ledger.bids.set(bid.id, bid);
    harness.ledger.segments.set(segment.id, segment);
    harness.ledger.rewardPools.set(pool.id, pool);

    const snapshot = composeSnapshot(
      harness.ledger,
      harness.bus,
      harness.auction,
      clearing,
      clearedAtMs,
    );

    expect(snapshot.latestClearedBid).toEqual({
      bidId: bid.id,
      segmentId: segment.id,
      grossAmountUsd: 25,
      listenerPoolUsd: 20,
      platformRevenueUsd: 5,
      explanation:
        "Won at $25.00: video production, cleared against 2 verified attention events; $20.00 allocated across verified listener rewards.",
      clearedAt: new Date(clearedAtMs).toISOString(),
    });
  });
});
