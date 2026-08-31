// StreamSnapshot composer — the authoritative response of GET /stream/snapshot
// (initial load and reconnect recovery; docs/technical/backend.md). Assembled
// from the ledger + bus + engines; never cached, always current.

import type {
  Segment as SharedSegment,
  StreamSnapshot,
} from "@slopstream/shared";
import type { AuctionEngine } from "./auction.js";
import { OPENING_PRICE_CENTS } from "./auction.js";
import { clearedBidExplanation, type ClearingEngine } from "./clearing.js";
import type { EventBus } from "./bus.js";
import { activeChallenge } from "./challenges.js";
import type { Ledger, SegmentRow } from "./ledger.js";
import { toBrandSummary } from "./market.js";
import { centsToUsd } from "./money.js";

function toSharedSegment(segment: SegmentRow): SharedSegment {
  return {
    id: segment.id,
    slot: segment.slot,
    brandId: segment.brandId,
    assetUrl: segment.mediaUrl,
    durationSeconds: segment.durationSec,
    summary: segment.summary,
    status: segment.status,
    ...(segment.clearedAmountCents !== undefined
      ? { clearedAmountUsd: centsToUsd(segment.clearedAmountCents) }
      : {}),
    ...(segment.clearedAtMs !== undefined
      ? { clearedAtMs: segment.clearedAtMs }
      : {}),
    ...(segment.windowOpenedAtMs !== undefined
      ? { windowOpenedAtMs: segment.windowOpenedAtMs }
      : {}),
  };
}

function latestClearedBidSummary(ledger: Ledger) {
  const segment = [...ledger.segments.values()]
    .filter(
      (candidate) =>
        candidate.clearedAtMs !== undefined && candidate.bidId !== null,
    )
    .sort((a, b) => (b.clearedAtMs ?? 0) - (a.clearedAtMs ?? 0))[0];
  if (!segment?.bidId || segment.clearedAtMs === undefined) return undefined;

  const bid = ledger.bids.get(segment.bidId);
  const pool = [...ledger.rewardPools.values()].find(
    (candidate) => candidate.bidId === segment.bidId,
  );
  if (!bid || bid.status !== "cleared" || !pool) return undefined;

  return {
    bidId: bid.id,
    segmentId: segment.id,
    grossAmountUsd: centsToUsd(pool.grossCents),
    listenerPoolUsd: centsToUsd(pool.eligibleCents),
    platformRevenueUsd: centsToUsd(pool.grossCents - pool.eligibleCents),
    explanation: clearedBidExplanation(bid, segment, pool.eligibleCents),
    clearedAt: new Date(segment.clearedAtMs).toISOString(),
  };
}

export function composeSnapshot(
  ledger: Ledger,
  bus: EventBus,
  auction: AuctionEngine,
  clearing: ClearingEngine,
  nowMs: number = Date.now(),
): StreamSnapshot {
  let nowPlayingRow: SegmentRow | undefined;
  for (const segment of ledger.segments.values()) {
    if (segment.status !== "playing") continue;
    if (!nowPlayingRow || segment.slot > nowPlayingRow.slot)
      nowPlayingRow = segment;
  }

  const open = auction.ensureOpenAuction();
  const recentSegments = [...ledger.segments.values()]
    .filter(
      (segment) =>
        segment.status === "done" &&
        segment.id !== nowPlayingRow?.id &&
        segment.windowOpenedAtMs !== undefined &&
        segment.windowOpenedAtMs >= nowMs - 30 * 60_000,
    )
    .sort(
      (a, b) =>
        (b.windowOpenedAtMs ?? 0) - (a.windowOpenedAtMs ?? 0) ||
        b.slot - a.slot,
    )
    .slice(0, 8)
    .map(toSharedSegment);

  // Upcoming queue — segments that are ready/generated but not yet playing.
  // These are the next 1-2 segments the scheduler will air.
  const upcomingSegments = [...ledger.segments.values()]
    .filter(
      (segment) =>
        segment.status === "ready" || segment.status === "generating",
    )
    .filter((segment) => segment.id !== nowPlayingRow?.id)
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 3)
    .map(toSharedSegment);

  return {
    asOfSequence: bus.sequence,
    nowPlaying: nowPlayingRow ? toSharedSegment(nowPlayingRow) : null,
    recentSegments,
    latestClearedBid: latestClearedBidSummary(ledger),
    upcomingSegments,
    nowPlayingStartedAt:
      nowPlayingRow?.windowOpenedAtMs !== undefined
        ? new Date(nowPlayingRow.windowOpenedAtMs).toISOString()
        : undefined,
    nowPlayingAttentionThreshold: nowPlayingRow?.requiredEvents,
    brands: [...ledger.brands.values()].map(toBrandSummary),
    leaderboard: open ? auction.leaderboardForSlot(open.slot) : [],
    nextSlotPriceUsd: open
      ? centsToUsd(auction.nextSlotPriceCents(open))
      : centsToUsd(OPENING_PRICE_CENTS),
    currentAuction: open
      ? { slot: open.slot, closesAt: new Date(open.closesAtMs).toISOString() }
      : undefined,
    listeners: clearing.activeListenerCount(nowMs),
    attentionProofs: clearing.totalAttentionProofs(),
    listenerRewardsUsd: centsToUsd(clearing.totalListenerRewardsCents()),
    activeChallenge: activeChallenge(ledger, nowMs),
    placedVolumeUsd: centsToUsd(
      [...ledger.bids.values()].reduce((sum, b) => sum + b.amountCents, 0),
    ),
    totalClearedVolumeUsd: centsToUsd(
      [...ledger.bids.values()]
        .filter((b) => b.status === "cleared")
        .reduce((sum, b) => sum + b.amountCents, 0),
    ),
  };
}
