// Encore queue helpers — pure functions for the dead-air replay system.
// The scheduler owns the state (EncoreRing); these functions decide depth
// and candidate selection so they can be tested without timers or HTTP.

import {
  FREE_BRAND_ID,
  playoutDurationFor,
  type Segment,
} from "@slopstream/shared";

/** Exponentially weighted moving average of generation duration (ms). */
export function updateEwma(
  prevMs: number | undefined,
  sampleMs: number,
  alpha = 0.3,
): number {
  if (prevMs === undefined) return sampleMs;
  return alpha * sampleMs + (1 - alpha) * prevMs;
}

/**
 * How many segments to keep ahead of playback. Slow generators get a deeper
 * buffer; clamped so a runaway sample cannot over-queue.
 */
export function prefetchDepthFor(
  ewmaMs: number | undefined,
  segmentPlaySec: number,
): number {
  if (ewmaMs === undefined) return 1;
  const depth = Math.ceil(ewmaMs / (segmentPlaySec * 1000));
  return Math.min(3, Math.max(1, depth));
}

export { playoutDurationFor } from "@slopstream/shared";

/** Explicit manifest media is preferred; assetUrl remains a migration fallback. */
export function playableAssetUrl(segment: Segment): string | undefined {
  return (
    segment.media?.visual?.url ?? segment.media?.audio.url ?? segment.assetUrl
  );
}

export interface EncoreRing {
  /** Last segment aired live OR as an encore — never replayed immediately. */
  lastAiredSegmentId?: string;
  /** Brand of the last encore — variety penalty for back-to-back repeats. */
  lastEncoreBrandId?: string;
  /** segmentId -> last encore start (ms). */
  encoredAtMs: Map<string, number>;
}

/**
 * Pick the next encore from recently aired (done) segments.
 * Skips segments without a playable asset and the immediately previous
 * segment; prefers least-recently-encored and avoids repeating the last
 * encore's brand unless no alternative exists.
 */
export function pickEncoreCandidate(
  recent: Segment[],
  ring: EncoreRing,
): Segment | null {
  const eligible = recent.filter(
    (s) =>
      playableAssetUrl(s) !== undefined && s.id !== ring.lastAiredSegmentId,
  );
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    const aAt = ring.encoredAtMs.get(a.id);
    const bAt = ring.encoredAtMs.get(b.id);
    // Never-encored first, then least recently encored.
    if ((aAt === undefined) !== (bAt === undefined)) {
      return aAt === undefined ? -1 : 1;
    }
    if (aAt !== undefined && bAt !== undefined && aAt !== bAt) {
      return aAt - bAt;
    }
    // Tie-break: older segments first (`recent` is newest-first).
    return recent.indexOf(b) - recent.indexOf(a);
  });

  const varied = sorted.filter(
    (s) => (s.brandId ?? FREE_BRAND_ID) !== ring.lastEncoreBrandId,
  );
  return (varied.length > 0 ? varied : sorted)[0] ?? null;
}
