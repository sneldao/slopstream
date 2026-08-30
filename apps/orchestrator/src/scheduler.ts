// Segment scheduler — the live brain. Polls auction results from Lane 2 and
// drives the full segment lifecycle: generating → progress beats → ready →
// playing → pull-ahead challenge firing → window-closed.
//
// The orchestrator NEVER resolves auctions or settles money (Lane 2's ledger
// is the single source of truth). It consumes auction results through
// GET /auctions/current, drives Lane 2's lifecycle routes + Lane 1's
// generator, and is the SOLE emitter of the five runtime event types
// (segment.generating, generation.progress, segment.ready, segment.playing,
// challenge.fired) when the API runs with PUBLISH_LIFECYCLE_EVENTS=0.
// Everything else (bid.*, attention.verified, reward.*, stats.*) comes from
// the API through the marketplace feed. See docs/technical/architecture.md —
// "Component responsibilities".

import type {
  AuctionState,
  GenerationStage,
  ProductionTier,
  PublicChallenge,
  Segment,
  StreamOpsMetrics,
} from "@slopstream/shared";
import { FREE_BRAND_ID } from "@slopstream/shared";
import type { ApiClient } from "./apiClient.js";
import {
  pickEncoreCandidate,
  prefetchDepthFor,
  updateEwma,
  type EncoreRing,
} from "./encore.js";
import type { OrchestratorEnv } from "./env.js";
import type { Gateway } from "./gateway.js";
import {
  continuityFromResult,
  marketContextFromSnapshot,
  marketIsHot,
} from "./marketContext.js";

type Winner = NonNullable<AuctionState["winner"]>;
type FreeSegment = NonNullable<AuctionState["freeSegment"]>;

interface DriveTarget {
  segmentId: string;
  /** Free filler segments use FREE_BRAND_ID (no real brand account). */
  brandId: string;
  brief: string;
  tier: ProductionTier;
}

const GENERATION_STAGES: GenerationStage[] = [
  "script",
  "voice",
  "image",
  "video",
];

export interface SchedulerDeps {
  env: OrchestratorEnv;
  gateway: Gateway;
  api: ApiClient;
}

interface Playback {
  segmentId: string;
  startedAtMs: number;
  durationSec: number;
  held: PublicChallenge | null;
  /** Orchestrator-only replay: no window, no challenges, no clearing. */
  encore?: boolean;
  timer?: NodeJS.Timeout;
  done: () => void;
}

export class SegmentScheduler {
  private readonly env: OrchestratorEnv;
  private readonly gateway: Gateway;
  private readonly api: ApiClient;
  /** Segments whose lifecycle we have fully driven. */
  private readonly processed = new Set<string>();
  /** Highest slot we have observed open; closed slots below it are ours. */
  private highSlotSeen = 0;
  private driving = false;
  private playback: Playback | null = null;
  /** Resolves when the current playback's window is closed. */
  private playbackSettled: Promise<void> = Promise.resolve();
  /** Continuity ring — summaries of the previous segments. */
  private previousSummaries: string[] = [];
  /** Hero image URL from the last generated segment — video continuity input. */
  private continuityImageUrl?: string;
  private generationInFlight = false;
  /** In-flight guard: at most one challenge-fire loop runs at a time. */
  private firingChallenge = false;
  private lastGenDurationMs?: number;
  private lastGenSegmentId?: string;
  /** Smoothed generation latency — drives the adaptive prefetch depth. */
  private genDurationEwmaMs?: number;
  /** Encore replay ring — ephemeral; restarts reset it by design. */
  private readonly encoreRing: EncoreRing = { encoredAtMs: new Map() };
  private encorePlaysTotal = 0;
  private lastEncoreSegmentId?: string;
  /** True between entering startPlayback and live playback starting — keeps
   *  a chained encore from outrunning an in-flight live start. */
  private liveIncoming = false;
  private pollTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(deps: SchedulerDeps) {
    this.env = deps.env;
    this.gateway = deps.gateway;
    this.api = deps.api;
  }

  async start(): Promise<void> {
    await this.adoptFromSnapshot();
    console.log(
      `[scheduler] polling ${this.env.apiBaseUrl}/auctions/current every ${this.env.auctionPollMs}ms`,
    );
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.playback?.timer) clearTimeout(this.playback.timer);
  }

  /** Ops metrics for GET /ops/metrics — stream health HUD. */
  async getMetrics(): Promise<StreamOpsMetrics> {
    let snapshot;
    try {
      snapshot = await this.api.snapshot();
    } catch {
      snapshot = undefined;
    }

    const playback = this.playback;
    const elapsedSec = playback
      ? (Date.now() - playback.startedAtMs) / 1000
      : undefined;
    const remainingSec =
      playback && elapsedSec !== undefined
        ? Math.max(0, playback.durationSec - elapsedSec)
        : undefined;
    const upcomingCount = snapshot?.upcomingSegments.length ?? 0;
    const encoreActive = !!playback?.encore;
    const atRisk =
      this.generationInFlight &&
      upcomingCount === 0 &&
      remainingSec !== undefined &&
      remainingSec < 15 &&
      !encoreActive;

    return {
      asOf: new Date().toISOString(),
      segmentPlaySec: this.env.segmentPlaySec,
      generation: {
        inFlight: this.generationInFlight,
        lastDurationMs: this.lastGenDurationMs,
        lastSegmentId: this.lastGenSegmentId,
        atRisk,
        ewmaDurationMs: this.genDurationEwmaMs,
        prefetchDepth: prefetchDepthFor(
          this.genDurationEwmaMs,
          this.env.segmentPlaySec,
        ),
      },
      playback: {
        active: !!playback,
        segmentId: playback?.segmentId,
        elapsedSec:
          elapsedSec !== undefined
            ? Math.round(elapsedSec * 10) / 10
            : undefined,
        remainingSec:
          remainingSec !== undefined
            ? Math.round(remainingSec * 10) / 10
            : undefined,
      },
      encore: {
        active: encoreActive,
        totalPlays: this.encorePlaysTotal,
        lastSegmentId: this.lastEncoreSegmentId,
      },
      queue: {
        nowPlayingStatus: snapshot?.nowPlaying?.status,
        upcomingCount,
        processedSegments: this.processed.size,
      },
      market: snapshot
        ? {
            leaderBrandId: snapshot.leaderboard[0]?.brandId,
            leaderAmountUsd: snapshot.leaderboard[0]?.amountUsd,
            openSlot: snapshot.currentAuction?.slot,
            nextSlotPriceUsd: snapshot.nextSlotPriceUsd,
          }
        : {},
    };
  }

  // ---------------------------------------------------------- startup adoption

  /**
   * Restart recovery: adopt an in-flight segment instead of re-driving it.
   * - playing → resume playback (recompute elapsed, keep firing challenges,
   *   close the window exactly once at the end).
   * - ready → generation + challenge-source already happened server-side;
   *   only playback remains. Never re-call /challenge-source (it appends).
   * - anything else → let the poll loop re-drive the closed slot from
   *   /generating (idempotent for the stub generator).
   */
  private async adoptFromSnapshot(): Promise<boolean> {
    try {
      const snapshot = await this.api.snapshot();
      const nowPlaying = snapshot.nowPlaying;
      if (!nowPlaying) return false;
      if (nowPlaying.status === "playing") {
        this.processed.add(nowPlaying.id);
        const startedAtMs = snapshot.nowPlayingStartedAt
          ? Date.parse(snapshot.nowPlayingStartedAt)
          : Date.now();
        console.log(`[scheduler] adopting playing segment ${nowPlaying.id}`);
        await this.beginPlayback(
          nowPlaying.id,
          nowPlaying.brandId ?? "",
          startedAtMs,
          nowPlaying.durationSeconds,
        );
        return true;
      } else if (nowPlaying.status === "ready") {
        console.log(`[scheduler] resuming ready segment ${nowPlaying.id}`);
        await this.startPlayback(
          nowPlaying.id,
          nowPlaying.brandId ?? "",
          nowPlaying.slot,
        );
        this.processed.add(nowPlaying.id);
        return true;
      }
    } catch {
      // API not up yet; the poll loop will pick up whatever is pending.
    }
    return false;
  }

  // ---------------------------------------------------------------- poll loop

  private async poll(): Promise<void> {
    if (this.stopped) return;
    try {
      const current = await this.api.currentAuction();
      this.highSlotSeen = Math.max(this.highSlotSeen, current.slot);

      // Belt-and-suspenders: if the API still reports an overdue open slot,
      // force-close via orchestrator token (timer recovery on the API should
      // already have swept this on GET /auctions/current).
      if (
        current.status === "open" &&
        Date.parse(current.closesAt) <= Date.now()
      ) {
        const closed = await this.api.closeCurrentAuction();
        if (closed) {
          this.highSlotSeen = Math.max(this.highSlotSeen, closed.slot);
        }
      }

      await this.processClosedSlots();
      await this.prefetchUpcoming();
      void this.maybeStartEncore();
    } catch {
      // API not ready yet; retry on the next tick.
    }
    if (!this.stopped) {
      this.pollTimer = setTimeout(
        () => void this.poll(),
        this.env.auctionPollMs,
      );
      this.pollTimer.unref();
    }
  }

  /** Process every incomplete closed slot in slot order. Persisted segment
   *  status prevents a restart from regenerating or refunding settled work. */
  private async processClosedSlots(): Promise<void> {
    for (let slot = 1; slot < this.highSlotSeen; slot++) {
      if (this.driving) return;
      try {
        const auction = await this.api.auctionForSlot(slot);
        if (!auction || auction.status !== "closed") continue;
        if (auction.winner) {
          const winner = auction.winner;
          if (this.processed.has(winner.segmentId)) continue;
          if (
            winner.segmentStatus === "done" ||
            winner.segmentStatus === "failed"
          ) {
            this.processed.add(winner.segmentId);
            continue;
          }
          if (winner.segmentStatus === "playing") {
            if (!this.playback) await this.adoptFromSnapshot();
            continue;
          }
          if (winner.segmentStatus === "ready") {
            await this.startPlayback(winner.segmentId, winner.brandId, slot);
            this.processed.add(winner.segmentId);
            continue;
          }
          await this.driveSegment(
            {
              segmentId: winner.segmentId,
              brandId: winner.brandId,
              brief: winner.brief,
              tier: winner.tier,
            },
            slot,
          );
        } else if (auction.freeSegment) {
          // No winner: drive the free (scraped-company) filler segment the
          // same way — generating → ready → playing → window-closed. No bid
          // exists, so no money moves and no pool is ever created.
          const free: FreeSegment = auction.freeSegment;
          if (this.processed.has(free.segmentId)) continue;
          if (
            free.segmentStatus === "done" ||
            free.segmentStatus === "failed"
          ) {
            this.processed.add(free.segmentId);
            continue;
          }
          if (free.segmentStatus === "playing") {
            if (!this.playback) await this.adoptFromSnapshot();
            continue;
          }
          if (free.segmentStatus === "ready") {
            await this.startPlayback(free.segmentId, FREE_BRAND_ID, slot);
            this.processed.add(free.segmentId);
            continue;
          }
          await this.driveSegment(
            {
              segmentId: free.segmentId,
              brandId: FREE_BRAND_ID,
              brief: free.brief,
              tier: free.tier,
            },
            slot,
          );
        }
      } catch {
        // Transient read failure; the next tick retries this slot.
        return;
      }
    }
  }

  /**
   * Keep segments generating ahead of playback so the stream does not stall
   * between windows. Depth adapts to measured generation latency: slow
   * generators get a deeper buffer (see prefetchDepthFor).
   */
  private async prefetchUpcoming(): Promise<void> {
    if (this.driving || this.generationInFlight) return;
    const depth = prefetchDepthFor(
      this.genDurationEwmaMs,
      this.env.segmentPlaySec,
    );
    try {
      const snapshot = await this.api.snapshot();
      if (snapshot.upcomingSegments.length >= depth) return;
    } catch {
      return;
    }
    await this.processClosedSlots();
  }

  // ------------------------------------------------------------ segment drive

  private async driveSegment(target: DriveTarget, slot: number): Promise<void> {
    const { segmentId, brandId, brief, tier } = target;
    const label = brandId === FREE_BRAND_ID ? "free (scraped)" : brandId;
    console.log(`[scheduler] slot ${slot} -> segment ${segmentId} (${label})`);

    try {
      await this.runGeneration({ segmentId, brandId, brief, tier }, slot);
      await this.startPlayback(segmentId, brandId, slot);
    } catch (error) {
      console.error(`[scheduler] drive failed for ${segmentId}:`, error);
      // Lane 2 releases the reservation and emits bid.failed itself. Only
      // once /failed lands is the segment terminal; if that call fails the
      // segment stays OUT of processed so the next poll tick retries.
      try {
        await this.api.failSegment(segmentId);
      } catch (failError) {
        console.error(
          `[scheduler] /failed for ${segmentId} did not land; will retry:`,
          failError,
        );
        return;
      }
    }
    this.processed.add(segmentId);
  }

  /** Generation only — releases the driving lock before playback waits. */
  private async runGeneration(
    target: DriveTarget,
    slot: number,
  ): Promise<void> {
    const { segmentId, brandId, brief, tier } = target;
    this.driving = true;
    this.generationInFlight = true;
    const genStartedAt = Date.now();

    try {
      this.gateway.emit({
        type: "segment.generating",
        segmentId,
        slot,
        tier,
        brandId,
      });
      await this.api.markGenerating(segmentId);

      let marketContext;
      try {
        marketContext = marketContextFromSnapshot(await this.api.snapshot());
      } catch {
        marketContext = undefined;
      }

      // Generation runs concurrently with the four progress beats; beats
      // complete before segment.ready so the screen's stage checkmarks land
      // in order.
      const generation = this.api.generate({
        segmentId,
        brandId,
        brief,
        tier,
        previousSummaries: this.previousSummaries,
        continuityImageUrl: this.continuityImageUrl,
        marketContext,
      });
      // Attach a handler now: if the generator is down the promise rejects
      // while the beats still run, and an unattached rejection crashes the
      // process. The error is surfaced again at the await below.
      void generation.catch(() => {});
      for (const stage of GENERATION_STAGES) {
        await this.delay(this.env.genStageDelayMs);
        if (this.stopped) return;
        this.gateway.emit({
          type: "generation.progress",
          slot,
          stage,
          done: true,
        });
      }
      const result = await generation;
      this.lastGenDurationMs = Date.now() - genStartedAt;
      this.lastGenSegmentId = segmentId;
      this.genDurationEwmaMs = updateEwma(
        this.genDurationEwmaMs,
        this.lastGenDurationMs,
      );
      this.continuityImageUrl =
        continuityFromResult(result) ?? this.continuityImageUrl;

      // Compressed playback: the orchestrator's segmentPlaySec — not the
      // generator's duration — is authoritative for the window timeline.
      await this.api.markReady(segmentId, {
        assetUrl: result.assetUrl,
        durationSec: this.env.segmentPlaySec,
        summary: result.summary,
      });
      this.gateway.emit({
        type: "segment.ready",
        segmentId,
        assetUrl: result.assetUrl,
        durationSec: this.env.segmentPlaySec,
      });
      await this.api.sendChallengeSource(segmentId, {
        transcript: result.transcript,
        durationSec: this.env.segmentPlaySec,
        visualMetadata: result.visualMetadata,
        audioMetadata: result.audioMetadata,
      });
      this.previousSummaries = [
        ...this.previousSummaries,
        result.summary,
      ].slice(-2);
    } finally {
      this.driving = false;
      this.generationInFlight = false;
    }
  }

  private async startPlayback(
    segmentId: string,
    brandId: string,
    _slot: number,
  ): Promise<void> {
    // Block chained encores from starting while a live segment is incoming.
    this.liveIncoming = true;
    try {
      if (!this.playback?.encore) {
        // Serialize live windows: never open a second window while one plays.
        await this.playbackSettled;
        if (this.stopped) return;
      }
      // /playing opens the window and freezes the threshold — call exactly
      // once. When an encore is on screen, open BEFORE cutting it: a failed
      // open leaves the encore playing instead of producing dead air.
      const receipt = await this.api.markPlaying(segmentId);
      this.cutEncore();
      await this.playbackSettled;
      if (this.stopped) return;
      await this.beginPlayback(
        segmentId,
        brandId,
        Date.parse(receipt.startedAt),
        this.env.segmentPlaySec,
      );
    } finally {
      this.liveIncoming = false;
    }
  }

  private async beginPlayback(
    segmentId: string,
    brandId: string,
    startedAtMs: number,
    durationSec: number,
  ): Promise<void> {
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.playbackSettled = settled;

    this.gateway.emit({
      type: "segment.playing",
      segmentId,
      brandId,
      startedAt: new Date(startedAtMs).toISOString(),
    });

    // Pull-ahead: /challenges/next marks fired on call, so pull the first
    // challenge immediately, hold it, broadcast at elapsed >= validFrom, then
    // pull the next. 404 (null) means the challenge list is exhausted.
    let held: PublicChallenge | null = null;
    try {
      held = await this.api.nextChallenge(segmentId);
    } catch (error) {
      console.warn(
        `[scheduler] challenge pull failed for ${segmentId}:`,
        error,
      );
    }

    const playback: Playback = {
      segmentId,
      startedAtMs,
      durationSec,
      held,
      done: settle,
    };
    this.playback = playback;
    this.encoreRing.lastAiredSegmentId = segmentId;
    console.log(`[scheduler] segment ${segmentId} playing (${durationSec}s)`);
    this.tickPlayback(playback);
  }

  private tickPlayback(playback: Playback): void {
    if (this.stopped || this.playback !== playback) return;
    const elapsedSec = (Date.now() - playback.startedAtMs) / 1000;

    if (elapsedSec >= playback.durationSec) {
      this.playback = null;
      void this.finishPlayback(playback);
      return;
    }

    // Fire every challenge whose window has opened; each broadcast pulls the
    // next one ahead so at most one challenge is held.
    void this.fireDueChallenges(playback);

    playback.timer = setTimeout(() => this.tickPlayback(playback), 200);
    playback.timer.unref();
  }

  /** Fire-loop for due challenges. Guarded by firingChallenge because every
   *  200ms tick would otherwise spawn a new loop over the same shared
   *  playback state — if nextChallenge() ever takes longer than the tick
   *  interval, concurrent loops double-broadcast challenges and lose fetch
   *  results. */
  private async fireDueChallenges(playback: Playback): Promise<void> {
    if (this.firingChallenge) return;
    this.firingChallenge = true;
    try {
      while (
        playback.held &&
        (Date.now() - playback.startedAtMs) / 1000 >= playback.held.validFrom
      ) {
        // A fetch can outlive playback: re-check shared state after every
        // await so a finished window never broadcasts stale challenges.
        if (this.stopped || this.playback !== playback) return;
        this.gateway.emit({
          type: "challenge.fired",
          challenge: playback.held,
        });
        console.log(
          `[scheduler] challenge fired for segment ${playback.segmentId}`,
        );
        try {
          playback.held = await this.api.nextChallenge(playback.segmentId);
        } catch {
          playback.held = null;
        }
      }
    } finally {
      this.firingChallenge = false;
    }
  }

  private async finishPlayback(playback: Playback): Promise<void> {
    // Encores live outside the clearing ledger — settle and chain the next
    // one immediately if the queue is still empty and the market still cold.
    if (playback.encore) {
      playback.done();
      void this.maybeStartEncore();
      return;
    }
    try {
      await this.api.closeWindow(playback.segmentId);
      console.log(`[scheduler] segment ${playback.segmentId} window closed`);
    } catch (error) {
      console.warn(
        `[scheduler] window-closed failed for ${playback.segmentId}:`,
        error,
      );
      // Let the poll loop re-adopt this still-playing segment and retry the
      // idempotent close. Without this, one transient failure strands funds.
      this.processed.delete(playback.segmentId);
    } finally {
      playback.done();
    }
  }

  // ------------------------------------------------------------- encore queue

  /**
   * Cover dead air with a replay of a previously aired segment. Runs when
   * nothing is playing or ready, no live segment is incoming, the market is
   * cold, and a candidate exists. Encores bypass the economic loop entirely
   * (no openWindow/closeWindow/challenges) and are cut the moment a real
   * segment becomes ready (see startPlayback).
   */
  private async maybeStartEncore(): Promise<void> {
    if (this.stopped || this.playback || this.liveIncoming) return;
    let snapshot;
    try {
      snapshot = await this.api.snapshot();
    } catch {
      return;
    }
    // A live playback or ready segment can have started during the fetch.
    if (this.stopped || this.playback || this.liveIncoming) return;
    if (snapshot.nowPlaying) return;
    if (snapshot.upcomingSegments.some((s) => s.status === "ready")) return;
    if (marketIsHot(snapshot)) return;
    const candidate = pickEncoreCandidate(
      snapshot.recentSegments,
      this.encoreRing,
    );
    if (!candidate) return;
    if (this.stopped || this.playback || this.liveIncoming) return;
    this.beginEncorePlayback(candidate);
  }

  private beginEncorePlayback(segment: Segment): void {
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.playbackSettled = settled;

    const brandId = segment.brandId ?? FREE_BRAND_ID;
    this.encoreRing.lastAiredSegmentId = segment.id;
    this.encoreRing.lastEncoreBrandId = brandId;
    this.encoreRing.encoredAtMs.set(segment.id, Date.now());
    this.encorePlaysTotal += 1;
    this.lastEncoreSegmentId = segment.id;

    this.gateway.emit({
      type: "segment.encore",
      segmentId: segment.id,
      brandId,
      startedAt: new Date().toISOString(),
      slot: segment.slot,
      assetUrl: segment.assetUrl as string,
      durationSec: this.env.segmentPlaySec,
      summary: segment.summary,
    });

    const playback: Playback = {
      segmentId: segment.id,
      startedAtMs: Date.now(),
      durationSec: this.env.segmentPlaySec,
      held: null,
      encore: true,
      done: settle,
    };
    this.playback = playback;
    console.log(`[scheduler] encore: replaying ${segment.id}`);
    this.tickPlayback(playback);
  }

  /** Stop an in-flight encore (no API calls, no event — the incoming
   *  segment.playing supersedes it on screen). */
  private cutEncore(): void {
    const playback = this.playback;
    if (!playback?.encore) return;
    if (playback.timer) clearTimeout(playback.timer);
    this.playback = null;
    playback.done();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
