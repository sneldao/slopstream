/**
 * Stream reducer — pure function from (state, WsEvent) -> state.
 *
 * This is the single client-side projection of the public `WsEvent` stream
 * into UI state. Both the demo player (fixture-driven) and a future live
 * WebSocket client use it unchanged: the only difference is the event
 * source. See docs/technical/backend.md "Live event contract".
 *
 * Invariants:
 *  - Pure: no side effects, no timers, no I/O. Deterministic given inputs.
 *  - Never trusts a delivery for money/balance state — only projects the
 *    public aggregate events documented in backend.md.
 *
 * Known contract gap (flagged to Lanes 1–2): `segment.generating` and
 * `segment.playing` do not carry `brandId`, so the screen cannot learn whose
 * ad is playing from events alone. The reducer infers the per-slot leader
 * from `bid.placed` / `bid.outbid` and attaches it to the generating/playing
 * segment. If the shared contract adds `brandId` to those events later, the
 * inference becomes redundant but stays correct.
 */

import type {
  BrandSummary,
  GenerationStage,
  LeaderboardEntry,
  ProductionTier,
  PublicChallenge,
  Segment,
  StreamSnapshot,
  WsEvent,
} from "@slopstream/shared";

export interface AttentionState {
  verifiedCount: number;
  total: number;
  threshold: number;
}

export interface GenerationState {
  slot: number;
  segmentId: string;
  /** Brand inferred from the slot's current leader (see contract-gap note). */
  brandId: string | null;
  tier: ProductionTier;
  doneStages: GenerationStage[];
  /** All stages complete; asset ready, waiting to play. */
  ready: boolean;
}

export interface ClearBurst {
  bidId: string;
  grossAmountUsd: number;
  listenerPoolUsd: number;
  platformRevenueUsd: number;
  /** Monotonic counter so the UI can key the burst animation per clear. */
  burstId: number;
}

export interface OutbidFlash {
  slot: number;
  displacedBrandId: string;
  newBrandId: string;
  prevAmountUsd: number;
  newAmountUsd: number;
  flashId: number;
}

export interface StreamState {
  asOfSequence: number;
  nowPlaying: Segment | null;
  nowPlayingStartedAt?: string;
  nowPlayingAttentionThreshold?: number;
  brands: BrandSummary[];
  /** brandId -> BrandSummary for O(1) palette lookup. */
  brandById: Record<string, BrandSummary>;
  leaderboard: LeaderboardEntry[];
  nextSlotPriceUsd: number;
  currentAuction?: { slot: number; closesAt: string };
  listeners: number;
  attentionProofs: number;
  listenerRewardsUsd: number;
  activeChallenge?: PublicChallenge;
  attention?: AttentionState;
  generation?: GenerationState;
  /** Most recent clear; UI animates a burst when `burstId` changes. */
  lastClear?: ClearBurst;
  /** Most recent outbid; UI flashes when `flashId` changes. */
  lastOutbid?: OutbidFlash;
}

export function snapshotToState(snapshot: StreamSnapshot): StreamState {
  const brandById: Record<string, BrandSummary> = {};
  for (const b of snapshot.brands) brandById[b.id] = b;
  return {
    asOfSequence: snapshot.asOfSequence,
    nowPlaying: snapshot.nowPlaying,
    nowPlayingStartedAt: snapshot.nowPlayingStartedAt,
    nowPlayingAttentionThreshold: snapshot.nowPlayingAttentionThreshold,
    brands: snapshot.brands,
    brandById,
    leaderboard: snapshot.leaderboard,
    nextSlotPriceUsd: snapshot.nextSlotPriceUsd,
    currentAuction: snapshot.currentAuction,
    listeners: snapshot.listeners,
    attentionProofs: snapshot.attentionProofs,
    listenerRewardsUsd: snapshot.listenerRewardsUsd,
    activeChallenge: snapshot.activeChallenge,
    attention: snapshot.nowPlayingAttentionThreshold
      ? {
          verifiedCount: 0,
          total: 0,
          threshold: snapshot.nowPlayingAttentionThreshold,
        }
      : undefined,
  };
}

const ALL_STAGES: GenerationStage[] = ["script", "voice", "image", "video"];

/**
 * Per-slot leader inference (see contract-gap note above). The reducer keeps
 * the highest bid per slot from `bid.placed` and corrects it on `bid.outbid`.
 * Not authoritative — the backend ledger is. This only lets the screen tint
 * to the right brand during generation/playback when the event omits brandId.
 */
function updateSlotLeaders(
  leaders: Record<number, { brandId: string; amount: number }>,
  event: WsEvent,
): Record<number, { brandId: string; amount: number }> {
  switch (event.type) {
    case "bid.placed": {
      const prev = leaders[event.slot];
      if (!prev || event.amountUsd > prev.amount) {
        return {
          ...leaders,
          [event.slot]: { brandId: event.brandId, amount: event.amountUsd },
        };
      }
      return leaders;
    }
    case "bid.outbid": {
      return {
        ...leaders,
        [event.slot]: { brandId: event.newBrandId, amount: event.newAmountUsd },
      };
    }
    default:
      return leaders;
  }
}

export function reduceStreamEvent(
  prev: StreamState,
  event: WsEvent,
  sequence?: number,
): StreamState {
  const slotLeaders = updateSlotLeaders(prev._slotLeaders ?? {}, event);
  let next: StreamState = { ...prev, _slotLeaders: slotLeaders };

  if (sequence !== undefined) next = { ...next, asOfSequence: sequence };

  switch (event.type) {
    case "bid.placed":
      // Leaderboard is updated separately via `leaderboard.updated`; nothing
      // to project here beyond the slot-leader inference above.
      return next;

    case "bid.outbid":
      return {
        ...next,
        lastOutbid: {
          slot: event.slot,
          displacedBrandId: event.displacedBrandId,
          newBrandId: event.newBrandId,
          prevAmountUsd: event.prevAmountUsd,
          newAmountUsd: event.newAmountUsd,
          flashId: (prev.lastOutbid?.flashId ?? 0) + 1,
        },
      };

    case "leaderboard.updated":
      return {
        ...next,
        leaderboard: event.ranking,
        nextSlotPriceUsd: event.nextSlotPriceUsd,
      };

    case "segment.generating": {
      const leader = slotLeaders[event.slot];
      return {
        ...next,
        generation: {
          slot: event.slot,
          segmentId: event.segmentId,
          brandId: leader?.brandId ?? null,
          tier: event.tier,
          doneStages: [],
          ready: false,
        },
        // A new generation supersedes any prior attention/challenge state.
        attention: undefined,
        activeChallenge: undefined,
      };
    }

    case "generation.progress": {
      if (!prev.generation || prev.generation.slot !== event.slot) return next;
      const doneStages = event.done
        ? Array.from(new Set([...prev.generation.doneStages, event.stage]))
        : prev.generation.doneStages.filter((s) => s !== event.stage);
      return {
        ...next,
        generation: { ...prev.generation, doneStages },
      };
    }

    case "segment.ready": {
      if (!prev.generation) return next;
      return {
        ...next,
        generation: {
          ...prev.generation,
          ready: true,
          doneStages: ALL_STAGES.slice(),
        },
      };
    }

    case "segment.playing": {
      const gen = prev.generation;
      const segment: Segment =
        prev.nowPlaying && prev.nowPlaying.id === event.segmentId
          ? { ...prev.nowPlaying, status: "playing" }
          : {
              id: event.segmentId,
              slot: gen?.slot ?? 0,
              brandId: gen?.brandId ?? null,
              durationSeconds: 0,
              summary: "",
              status: "playing",
            };
      return {
        ...next,
        nowPlaying: segment,
        nowPlayingStartedAt: event.startedAt,
        // Clear generation once playing; keep threshold from snapshot if present.
        generation: undefined,
        attention: prev.nowPlayingAttentionThreshold
          ? {
              verifiedCount: 0,
              total: 0,
              threshold: prev.nowPlayingAttentionThreshold,
            }
          : prev.attention,
      };
    }

    case "challenge.fired":
      return { ...next, activeChallenge: event.challenge };

    case "attention.verified":
      return {
        ...next,
        attention: {
          verifiedCount: event.verifiedCount,
          total: event.total,
          threshold: event.threshold,
        },
        // Mirror the running verified count into the big-screen stat too.
        attentionProofs: Math.max(prev.attentionProofs, event.verifiedCount),
      };

    case "bid.cleared":
      return {
        ...next,
        lastClear: {
          bidId: event.bidId,
          grossAmountUsd: event.grossAmountUsd,
          listenerPoolUsd: event.listenerPoolUsd,
          platformRevenueUsd: event.platformRevenueUsd,
          burstId: (prev.lastClear?.burstId ?? 0) + 1,
        },
      };

    case "bid.uncleared":
      // Threshold missed; nothing to project beyond clearing the attention state.
      return { ...next, attention: undefined, activeChallenge: undefined };

    case "reward.pool.updated":
      // Pool distribution is surfaced via stats.updated; nothing extra here.
      return next;

    case "stats.updated":
      return {
        ...next,
        listeners: event.listeners,
        attentionProofs: event.attentionProofs,
        listenerRewardsUsd: event.listenerRewardsUsd,
      };

    default:
      return next;
  }
}

// Internal cache: per-slot leader inference (see contract-gap note above).
// Carried forward on state via interface merging so consumers don't see it
// in the primary declaration but the reducer can read/write it.
export interface StreamState {
  _slotLeaders?: Record<number, { brandId: string; amount: number }>;
}
