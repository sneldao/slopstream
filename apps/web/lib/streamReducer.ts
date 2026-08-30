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
  /** Asset URL from `segment.ready` — carried into the playing segment. */
  assetUrl?: string;
  /** Duration from `segment.ready` — carried into the playing segment. */
  durationSeconds?: number;
}

export interface ClearBurst {
  bidId: string;
  grossAmountUsd: number;
  listenerPoolUsd: number;
  platformRevenueUsd: number;
  /** Monotonic counter so the UI can key the burst animation per clear. */
  burstId: number;
}

/** Latest bid settlement — clear / threshold miss / generation fail. */
export interface SettlementFlash {
  kind: "cleared" | "uncleared" | "failed";
  bidId: string;
  /** Gross cleared, or amount returned on miss/fail. */
  amountUsd: number;
  listenerPoolUsd?: number;
  platformRevenueUsd?: number;
  flashId: number;
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
  /** Tier of the currently-playing segment (carried from generation). The
   *  3D AdSurface uses this to pick orb vs image plane vs video plane. */
  playingTier?: ProductionTier;
  /** Most recent clear; UI animates a burst when `burstId` changes. */
  lastClear?: ClearBurst;
  /** Most recent settlement outcome for brand / listen feedback. */
  lastSettlement?: SettlementFlash;
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

export function reduceStreamEvent(
  prev: StreamState,
  event: WsEvent,
  sequence?: number,
): StreamState {
  let next: StreamState = { ...prev };

  if (sequence !== undefined) next = { ...next, asOfSequence: sequence };

  switch (event.type) {
    case "auction.opened":
      return {
        ...next,
        currentAuction: { slot: event.slot, closesAt: event.closesAt },
        nextSlotPriceUsd: event.nextSlotPriceUsd,
        leaderboard: [],
      };

    case "bid.placed":
      // Leaderboard is updated separately via `leaderboard.updated`; nothing
      // to project here.
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
      return {
        ...next,
        generation: {
          slot: event.slot,
          segmentId: event.segmentId,
          brandId: event.brandId,
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
          assetUrl: event.assetUrl,
          durationSeconds: event.durationSec,
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
              brandId: event.brandId,
              durationSeconds: gen?.durationSeconds ?? 0,
              summary: "",
              status: "playing",
              ...(gen?.assetUrl ? { assetUrl: gen.assetUrl } : {}),
            };
      return {
        ...next,
        nowPlaying: segment,
        nowPlayingStartedAt: event.startedAt,
        // Carry the tier from generation into playback so the 3D AdSurface
        // knows whether to render an orb, image plane, or video plane.
        playingTier: gen?.tier,
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
        lastSettlement: {
          kind: "cleared",
          bidId: event.bidId,
          amountUsd: event.grossAmountUsd,
          listenerPoolUsd: event.listenerPoolUsd,
          platformRevenueUsd: event.platformRevenueUsd,
          flashId: (prev.lastSettlement?.flashId ?? 0) + 1,
        },
        nowPlaying:
          prev.nowPlaying?.id === event.segmentId ? null : prev.nowPlaying,
        playingTier: undefined,
        activeChallenge: undefined,
        attention: undefined,
      };

    case "bid.uncleared":
      // Threshold missed — return spend and clear attention window.
      return {
        ...next,
        lastSettlement: {
          kind: "uncleared",
          bidId: event.bidId,
          amountUsd: event.returnedAmountUsd,
          flashId: (prev.lastSettlement?.flashId ?? 0) + 1,
        },
        nowPlaying:
          prev.nowPlaying?.id === event.segmentId ? null : prev.nowPlaying,
        playingTier: undefined,
        attention: undefined,
        activeChallenge: undefined,
      };

    case "bid.failed":
      return {
        ...next,
        lastSettlement: {
          kind: "failed",
          bidId: event.bidId,
          amountUsd: event.returnedAmountUsd,
          flashId: (prev.lastSettlement?.flashId ?? 0) + 1,
        },
        generation:
          prev.generation?.segmentId === event.segmentId
            ? undefined
            : prev.generation,
        nowPlaying:
          prev.nowPlaying?.id === event.segmentId ? null : prev.nowPlaying,
        playingTier: undefined,
        attention: undefined,
        activeChallenge: undefined,
      };

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
