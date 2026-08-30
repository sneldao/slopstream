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
} from "@slopstream/shared";
import { FREE_BRAND_ID } from "@slopstream/shared";
import type { ApiClient } from "./apiClient.js";
import type { OrchestratorEnv } from "./env.js";
import type { Gateway } from "./gateway.js";

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
      await this.processClosedSlots();
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
    if (this.driving) return;
    for (let slot = 1; slot < this.highSlotSeen; slot++) {
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
          this.driving = true;
          try {
            if (winner.segmentStatus === "ready") {
              await this.startPlayback(winner.segmentId, winner.brandId, slot);
              this.processed.add(winner.segmentId);
            } else {
              await this.driveSegment(
                {
                  segmentId: winner.segmentId,
                  brandId: winner.brandId,
                  brief: winner.brief,
                  tier: winner.tier,
                },
                slot,
              );
            }
          } finally {
            this.driving = false;
          }
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
          this.driving = true;
          try {
            if (free.segmentStatus === "ready") {
              await this.startPlayback(free.segmentId, FREE_BRAND_ID, slot);
              this.processed.add(free.segmentId);
            } else {
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
          } finally {
            this.driving = false;
          }
        }
      } catch {
        // Transient read failure; the next tick retries this slot.
        return;
      }
    }
  }

  // ------------------------------------------------------------ segment drive

  private async driveSegment(target: DriveTarget, slot: number): Promise<void> {
    const { segmentId, brandId, brief, tier } = target;
    this.processed.add(segmentId);
    const label = brandId === FREE_BRAND_ID ? "free (scraped)" : brandId;
    console.log(`[scheduler] slot ${slot} -> segment ${segmentId} (${label})`);

    try {
      this.gateway.emit({
        type: "segment.generating",
        segmentId,
        slot,
        tier,
        brandId,
      });
      await this.api.markGenerating(segmentId);

      // Generation runs concurrently with the four progress beats; beats
      // complete before segment.ready so the screen's stage checkmarks land
      // in order.
      const generation = this.api.generate({
        segmentId,
        brandId,
        brief,
        tier,
        previousSummaries: this.previousSummaries,
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

      await this.startPlayback(segmentId, brandId, slot);
    } catch (error) {
      console.error(`[scheduler] drive failed for ${segmentId}:`, error);
      // Lane 2 releases the reservation and emits bid.failed itself.
      await this.api.failSegment(segmentId);
    }
  }

  private async startPlayback(
    segmentId: string,
    brandId: string,
    _slot: number,
  ): Promise<void> {
    // Serialize playback: never open a second window while one plays.
    await this.playbackSettled;
    if (this.stopped) return;

    // /playing opens the window and freezes the threshold — call exactly once.
    const receipt = await this.api.markPlaying(segmentId);
    await this.beginPlayback(
      segmentId,
      brandId,
      Date.parse(receipt.startedAt),
      this.env.segmentPlaySec,
    );
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
    void (async () => {
      while (
        playback.held &&
        (Date.now() - playback.startedAtMs) / 1000 >= playback.held.validFrom
      ) {
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
    })();

    playback.timer = setTimeout(() => this.tickPlayback(playback), 200);
    playback.timer.unref();
  }

  private async finishPlayback(playback: Playback): Promise<void> {
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
