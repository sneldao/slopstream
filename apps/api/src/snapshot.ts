// StreamSnapshot composer — the authoritative response of GET /stream/snapshot
// (initial load and reconnect recovery; docs/technical/backend.md). Assembled
// from the ledger + bus + engines; never cached, always current.

import type {
  Segment as SharedSegment,
  StreamSnapshot,
} from "@slopstream/shared";
import type { AuctionEngine } from "./auction.js";
import { OPENING_PRICE_CENTS } from "./auction.js";
import type { ClearingEngine } from "./clearing.js";
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

  const open = auction.openAuction();
  const recentSegments = [...ledger.segments.values()]
    .filter(
      (segment) =>
        segment.status === "done" && segment.id !== nowPlayingRow?.id,
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
        segment.status === "ready" ||
        segment.status === "generating",
    )
    .filter((segment) => segment.id !== nowPlayingRow?.id)
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 2)
    .map(toSharedSegment);

  return {
    asOfSequence: bus.sequence,
    nowPlaying: nowPlayingRow ? toSharedSegment(nowPlayingRow) : null,
    recentSegments,
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
  };
}
