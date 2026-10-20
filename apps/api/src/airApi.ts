// Machine-readable broadcast surface — roadmap Phase 3b, P0.
// docs/technical/roadmap.md owns the why; this module is the read half only.
//
// Agents ask three questions of a TV station: what is on air, what aired and
// did anyone provably watch it, and can I verify that claim myself. Two rules
// shape everything below.
//
// 1. **Whitelist projection.** Author-written text never leaves this module —
//    transcript, brief, `SegmentRow.summary`, and the challenge
//    question/options/answer are all excluded. Brand- and partner-authored
//    prose in an agent's context window is an injection payload, and a leaked
//    challenge is an answer key. Fields are copied one at a time; there is no
//    spread of a segment anywhere in here, so widening the projection is a
//    visible diff rather than an accident.
// 2. **Reads never settle.** Nothing reachable here can clear a bid or mint a
//    listener reward. `settlement` reports what already happened to a slot.
//    That stays true when this surface starts charging for calls: a price on a
//    read does not make the read an economic action.
//
// Metering is a free-tier fairness heuristic, not access control — see
// `clientKey`. There is deliberately no x402 `PAYMENT-REQUIRED` payload here:
// advertising a payable resource with no facilitator to settle it invites an
// agent wallet to attempt a real payment against nothing. The 429 says what is
// true, and the header shape arrives with a rail.

import type { NextFunction, Request, Response, Router } from "express";
import type { ClearingEngine } from "./clearing.js";
import { centsToUsd } from "./money.js";
import type { EventBus } from "./bus.js";
import type { Ledger, SegmentRow } from "./ledger.js";

export interface AirApiConfig {
  /** Disabled reads answer 404, the same as a route that was never mounted. */
  enabled: boolean;
  /** Calls permitted per client per window. */
  callsPerWindow: number;
  windowMs: number;
}

export const DEFAULT_AIR_API_CONFIG: AirApiConfig = {
  enabled: true,
  callsPerWindow: 120,
  windowMs: 60_000,
};

const DEFAULT_HISTORY_LIMIT = 25;
const MAX_HISTORY_LIMIT = 100;

export interface AirSlot {
  segmentId: string;
  slot: number;
  brandId: string | null;
  status: SegmentRow["status"];
  durationSeconds: number;
  style?: string;
  airedAt?: string;
  media?: { audioUrl: string; visualUrl?: string; durationSec: number };
  attention: {
    validProofs: number;
    requiredProofs?: number;
    thresholdMet?: boolean;
  };
  settlement: {
    /** False for evergreen and free airings: no bid, nothing to clear. */
    settles: boolean;
    clearedAmountUsd?: number;
    clearedAt?: string;
  };
}

export interface AirApiDeps {
  ledger: Ledger;
  bus: EventBus;
  clearing: ClearingEngine;
  config?: Partial<AirApiConfig>;
  now?: () => number;
}

/**
 * Sliding-window counter per client. Only the newest window is kept per key, so
 * an idle key costs one number; keys are pruned when their window expires
 * rather than on a timer, because this surface has no reason to hold a daemon.
 */
class WindowCounter {
  private readonly hits = new Map<string, { startMs: number; count: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly limit: number,
  ) {}

  take(
    key: string,
    nowMs: number,
  ): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const entry = this.hits.get(key);
    if (!entry || nowMs - entry.startMs >= this.windowMs) {
      if (entry) this.hits.delete(key);
      this.hits.set(key, { startMs: nowMs, count: 1 });
      this.prune(nowMs);
      return {
        allowed: true,
        remaining: Math.max(this.limit - 1, 0),
        retryAfterMs: 0,
      };
    }
    if (entry.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.windowMs - (nowMs - entry.startMs),
      };
    }
    entry.count += 1;
    return {
      allowed: true,
      remaining: Math.max(this.limit - entry.count, 0),
      retryAfterMs: 0,
    };
  }

  private prune(nowMs: number): void {
    for (const [key, entry] of this.hits) {
      if (nowMs - entry.startMs >= this.windowMs) this.hits.delete(key);
    }
  }
}

/**
 * Identifies a client for fairness only. `X-Forwarded-For` is client-supplied
 * and trivially spoofed, so this rate limit is a nudge against a runaway loop,
 * not a defence — the real bound on this surface is that it exposes nothing a
 * browser cannot already read off the snapshot.
 */
function clientKey(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.ip || "unknown";
}

export function registerAirRoutes(router: Router, deps: AirApiDeps): void {
  const { ledger, bus, clearing } = deps;
  const config: AirApiConfig = { ...DEFAULT_AIR_API_CONFIG, ...deps.config };
  const now = deps.now ?? (() => Date.now());
  const counter = new WindowCounter(config.windowMs, config.callsPerWindow);

  const meter = (req: Request, res: Response, next: NextFunction): void => {
    if (!config.enabled) {
      res.status(404).json({ error: "the broadcast api is not enabled" });
      return;
    }
    const outcome = counter.take(clientKey(req), now());
    res.setHeader("x-air-tier", "free");
    res.setHeader("x-air-remaining", String(outcome.remaining));
    if (!outcome.allowed) {
      res.setHeader(
        "retry-after",
        String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))),
      );
      res.status(429).json({
        error: `broadcast api free tier allows ${config.callsPerWindow} calls per ${Math.round(
          config.windowMs / 1000,
        )}s`,
        metering: { tier: "free", retryAfterMs: outcome.retryAfterMs },
      });
      return;
    }
    next();
  };

  const toAirSlot = (segment: SegmentRow): AirSlot => {
    const validProofs = ledger.validEventsForSegment(segment.id).length;
    const requiredProofs = segment.requiredEvents;
    return {
      segmentId: segment.id,
      slot: segment.slot,
      brandId: segment.brandId,
      status: segment.status,
      durationSeconds: segment.durationSec,
      ...(segment.style !== undefined ? { style: segment.style } : {}),
      ...(segment.windowOpenedAtMs !== undefined
        ? { airedAt: new Date(segment.windowOpenedAtMs).toISOString() }
        : {}),
      ...(segment.media
        ? {
            media: {
              audioUrl: segment.media.audio.url,
              ...(segment.media.visual
                ? { visualUrl: segment.media.visual.url }
                : {}),
              durationSec: segment.media.durationSec,
            },
          }
        : {}),
      attention: {
        validProofs,
        ...(requiredProofs !== undefined
          ? {
              requiredProofs,
              // "Did it meet the bar?" has no answer for a slot with no bar.
              thresholdMet: validProofs >= requiredProofs,
            }
          : {}),
      },
      settlement: {
        settles: segment.bidId !== null,
        ...(segment.clearedAmountCents !== undefined
          ? { clearedAmountUsd: centsToUsd(segment.clearedAmountCents) }
          : {}),
        ...(segment.clearedAtMs !== undefined
          ? { clearedAt: new Date(segment.clearedAtMs).toISOString() }
          : {}),
      },
    };
  };

  const doneSegments = (): SegmentRow[] =>
    [...ledger.segments.values()]
      .filter((segment) => segment.status === "done")
      .sort(
        (a, b) =>
          (b.windowOpenedAtMs ?? 0) - (a.windowOpenedAtMs ?? 0) ||
          b.slot - a.slot,
      );

  const playingSegment = (): SegmentRow | undefined => {
    let playing: SegmentRow | undefined;
    for (const segment of ledger.segments.values()) {
      if (segment.status !== "playing") continue;
      if (!playing || segment.slot > playing.slot) playing = segment;
    }
    return playing;
  };

  router.get(
    "/air/now",
    meter,
    wrap((_req, res) => {
      const nowPlaying = playingSegment();
      const at = now();
      res.json({
        version: 1 as const,
        asOf: new Date(at).toISOString(),
        sequence: bus.sequence,
        nowPlaying: nowPlaying ? toAirSlot(nowPlaying) : null,
        recentlyAired: doneSegments().slice(0, 8).map(toAirSlot),
        upcoming: [...ledger.segments.values()]
          .filter(
            (segment) =>
              (segment.status === "ready" || segment.status === "generating") &&
              segment.id !== nowPlaying?.id,
          )
          .sort((a, b) => a.slot - b.slot)
          .slice(0, 3)
          .map(toAirSlot),
        audience: {
          listeners: clearing.activeListenerCount(at),
          attentionProofs: clearing.totalAttentionProofs(),
        },
      });
    }),
  );

  router.get(
    "/air/history",
    meter,
    wrap((req, res) => {
      const limitParam = req.query.limit;
      const limit =
        typeof limitParam === "string" && limitParam !== ""
          ? Number(limitParam)
          : DEFAULT_HISTORY_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
        res.status(400).json({
          error: `limit must be an integer between 1 and ${MAX_HISTORY_LIMIT}`,
        });
        return;
      }
      const sinceParam = req.query.since;
      let sinceMs: number | undefined;
      if (typeof sinceParam === "string" && sinceParam !== "") {
        const parsed = Date.parse(sinceParam);
        if (Number.isNaN(parsed)) {
          res.status(400).json({ error: "since must be an ISO timestamp" });
          return;
        }
        sinceMs = parsed;
      }

      const slots = doneSegments()
        .filter(
          (segment) =>
            sinceMs === undefined || (segment.windowOpenedAtMs ?? 0) >= sinceMs,
        )
        .slice(0, limit)
        .map(toAirSlot);

      res.json({
        version: 1 as const,
        asOf: new Date(now()).toISOString(),
        slots,
      });
    }),
  );

  router.get(
    "/air/receipt/:segmentId",
    meter,
    wrap((req, res) => {
      const segmentId = String(req.params.segmentId ?? "");
      const segment = ledger.segments.get(segmentId);
      if (!segment) {
        res.status(404).json({ error: `unknown segment ${segmentId}` });
        return;
      }
      const valid = ledger.validEventsForSegment(segmentId);
      res.json({
        version: 1 as const,
        slot: toAirSlot(segment),
        windowClosed: segment.windowClosed,
        // A nullifier is already public by design — it is what `GET /verify`
        // takes, and it identifies a proof, never a person. Nothing else on
        // the event row is exposed: no session id, no estimated reward, no
        // challenge text.
        proofIds: valid.map((event) => event.proofRef),
        totals: {
          validProofs: valid.length,
          challenges: ledger.challengesForSegment(segmentId).length,
        },
      });
    }),
  );
}

/** Route a throw to the API error middleware, matching routes.ts. */
function wrap(
  handler: (req: Request, res: Response) => void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    try {
      handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}
