/**
 * Stream reducer — pure function from (state, WsEvent) -> state.
 *
 * This is the single client-side projection of the public `WsEvent` stream
 * into UI state. The live WebSocket client applies events through this reducer.
 * See docs/technical/backend.md "Live event contract".
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
  /** Explicit media manifest from `segment.ready`. */
  media?: Segment["media"];
  /** Duration from `segment.ready` — carried into the playing segment. */
  durationSeconds?: number;
}

export interface ClearBurst {
  bidId: string;
  grossAmountUsd: number;
  listenerPoolUsd: number;
  platformRevenueUsd: number;
  explanation?: string;
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
  explanation?: string;
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
  /** True while nowPlaying is an orchestrator encore replay. Never set by
   *  snapshotToState, so any snapshot refetch resets it automatically. */
  nowPlayingEncore?: boolean;
  /** Durable and event-projected Continuum history, newest first.
   *  Age-capped by Snapshot.recentSegments.asOfMs — segments whose
   *  windowOpenedAtMs predates the cap are pruned on snapshot refetch only. */
  recentSegments: Segment[];
  /** Segments that are ready/generating but not yet playing — the queue. */
  upcomingSegments: Segment[];
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
  /** Gross bid volume placed across all slots, backfilled by snapshots. */
  placedVolumeUsd: number;
  /** Gross volume successfully settled after attention cleared. */
  totalClearedVolumeUsd: number;
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
    recentSegments: snapshot.recentSegments,
    upcomingSegments: snapshot.upcomingSegments ?? [],
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
    placedVolumeUsd: snapshot.placedVolumeUsd ?? 0,
    totalClearedVolumeUsd: snapshot.totalClearedVolumeUsd ?? 0,
    lastClear: snapshot.latestClearedBid
      ? {
          ...snapshot.latestClearedBid,
          burstId: 0,
        }
      : undefined,
    lastSettlement: snapshot.latestClearedBid
      ? {
          kind: "cleared",
          bidId: snapshot.latestClearedBid.bidId,
          amountUsd: snapshot.latestClearedBid.grossAmountUsd,
          listenerPoolUsd: snapshot.latestClearedBid.listenerPoolUsd,
          platformRevenueUsd: snapshot.latestClearedBid.platformRevenueUsd,
          explanation: snapshot.latestClearedBid.explanation,
          flashId: 0,
        }
      : undefined,
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
      // Leaderboard is updated separately via `leaderboard.updated`; the
      // aggregate still advances immediately so a healthy WS session does not
      // display stale market volume until its next snapshot.
      return {
        ...next,
        placedVolumeUsd: prev.placedVolumeUsd + event.amountUsd,
      };

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
      const queued = prev.upcomingSegments.find(
        (segment) => segment.id === event.segmentId,
      );
      const readySegment: Segment = {
        ...queued,
        id: event.segmentId,
        slot: prev.generation?.slot ?? queued?.slot ?? 0,
        brandId: prev.generation?.brandId ?? queued?.brandId ?? null,
        assetUrl: event.assetUrl,
        media: event.media,
        durationSeconds: event.durationSec,
        summary: queued?.summary ?? "",
        status: "ready",
      };
      return {
        ...next,
        ...(prev.generation
          ? {
              generation: {
                ...prev.generation,
                ready: true,
                doneStages: ALL_STAGES.slice(),
                assetUrl: event.assetUrl,
                media: event.media,
                durationSeconds: event.durationSec,
              },
            }
          : {}),
        // Warm the next explicit manifest before segment.playing arrives.
        upcomingSegments: [
          readySegment,
          ...prev.upcomingSegments.filter((s) => s.id !== event.segmentId),
        ],
      };
    }

    case "segment.playing": {
      const gen = prev.generation;
      const queued = prev.upcomingSegments.find(
        (segment) => segment.id === event.segmentId,
      );
      const currentSegment =
        prev.nowPlaying?.id === event.segmentId ? prev.nowPlaying : queued;
      const previousSegment =
        prev.nowPlaying && prev.nowPlaying.id !== event.segmentId
          ? { ...prev.nowPlaying, status: "done" as const }
          : undefined;
      const segment: Segment = {
        ...currentSegment,
        id: event.segmentId,
        slot: currentSegment?.slot ?? gen?.slot ?? 0,
        brandId: event.brandId,
        durationSeconds:
          currentSegment?.durationSeconds ?? gen?.durationSeconds ?? 0,
        summary: currentSegment?.summary ?? "",
        status: "playing",
        ...(currentSegment?.assetUrl || gen?.assetUrl
          ? { assetUrl: currentSegment?.assetUrl ?? gen?.assetUrl }
          : {}),
        ...(currentSegment?.media || gen?.media
          ? { media: currentSegment?.media ?? gen?.media }
          : {}),
        ...(event.windowOpenedAtMs
          ? { windowOpenedAtMs: Date.parse(event.windowOpenedAtMs) }
          : currentSegment?.windowOpenedAtMs
            ? { windowOpenedAtMs: currentSegment.windowOpenedAtMs }
            : {}),
      };
      return {
        ...next,
        nowPlaying: segment,
        nowPlayingEncore: undefined,
        recentSegments: addRecentSegment(prev.recentSegments, previousSegment),
        upcomingSegments: prev.upcomingSegments.filter(
          (s) => s.id !== event.segmentId,
        ),
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

    case "segment.encore": {
      // Self-contained replay event — encores never touch the API snapshot.
      // Keep `generation`: a concurrent generation is the normal encore
      // scenario and its segment.ready/playing must still land.
      const previousSegment =
        prev.nowPlaying && prev.nowPlaying.id !== event.segmentId
          ? { ...prev.nowPlaying, status: "done" as const }
          : undefined;
      return {
        ...next,
        nowPlaying: {
          id: event.segmentId,
          slot: event.slot,
          brandId: event.brandId,
          assetUrl: event.assetUrl,
          ...(event.media ? { media: event.media } : {}),
          durationSeconds: event.durationSec,
          summary: event.summary,
          status: "playing",
          ...(event.windowOpenedAtMs
            ? { windowOpenedAtMs: Date.parse(event.windowOpenedAtMs) }
            : {}),
        },
        nowPlayingEncore: true,
        nowPlayingStartedAt: event.startedAt,
        recentSegments: addRecentSegment(prev.recentSegments, previousSegment),
        // The Scene derives the media surface from assetUrl during encores.
        playingTier: undefined,
        activeChallenge: undefined,
        attention: undefined,
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
        recentSegments: addRecentSegment(
          prev.recentSegments,
          prev.nowPlaying?.id === event.segmentId
            ? { ...prev.nowPlaying, status: "done" }
            : undefined,
        ).map((s) =>
          s.id === event.segmentId && s.clearedAmountUsd === undefined
            ? { ...s, clearedAmountUsd: event.grossAmountUsd }
            : s,
        ),
        lastClear: {
          bidId: event.bidId,
          grossAmountUsd: event.grossAmountUsd,
          listenerPoolUsd: event.listenerPoolUsd,
          platformRevenueUsd: event.platformRevenueUsd,
          explanation: event.explanation,
          burstId: (prev.lastClear?.burstId ?? 0) + 1,
        },
        lastSettlement: {
          kind: "cleared",
          bidId: event.bidId,
          amountUsd: event.grossAmountUsd,
          listenerPoolUsd: event.listenerPoolUsd,
          platformRevenueUsd: event.platformRevenueUsd,
          explanation: event.explanation,
          flashId: (prev.lastSettlement?.flashId ?? 0) + 1,
        },
        nowPlaying:
          prev.nowPlaying?.id === event.segmentId ? null : prev.nowPlaying,
        nowPlayingEncore:
          prev.nowPlaying?.id === event.segmentId
            ? undefined
            : prev.nowPlayingEncore,
        playingTier: undefined,
        activeChallenge: undefined,
        attention: undefined,
        totalClearedVolumeUsd:
          prev.totalClearedVolumeUsd + event.grossAmountUsd,
      };

    case "bid.uncleared":
      // Threshold missed — return spend and clear attention window.
      return {
        ...next,
        recentSegments: addRecentSegment(
          prev.recentSegments,
          prev.nowPlaying?.id === event.segmentId
            ? { ...prev.nowPlaying, status: "done" }
            : undefined,
        ).map((s) =>
          s.id === event.segmentId && s.clearedAmountUsd === undefined
            ? { ...s, clearedAmountUsd: undefined }
            : s,
        ),
        lastSettlement: {
          kind: "uncleared",
          bidId: event.bidId,
          amountUsd: event.returnedAmountUsd,
          flashId: (prev.lastSettlement?.flashId ?? 0) + 1,
        },
        nowPlaying:
          prev.nowPlaying?.id === event.segmentId ? null : prev.nowPlaying,
        nowPlayingEncore:
          prev.nowPlaying?.id === event.segmentId
            ? undefined
            : prev.nowPlayingEncore,
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
        nowPlayingEncore:
          prev.nowPlaying?.id === event.segmentId
            ? undefined
            : prev.nowPlayingEncore,
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

function addRecentSegment(
  segments: Segment[],
  segment: Segment | undefined,
): Segment[] {
  if (!segment) return segments;
  return [segment, ...segments.filter((item) => item.id !== segment.id)].slice(
    0,
    8,
  );
}
