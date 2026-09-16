// Evergreen rotation + airing (docs/product/evergreen-loop.md Stage 1).
// Entries are immutable templates; each airing mints a fresh ephemeral
// segment row through the normal lifecycle (ready -> playing -> done).
import {
  isMediaManifest,
  type EvergreenEntry,
  type EvergreenMediaFile,
  type EvergreenRotationState,
  type MediaManifest,
} from "@slopstream/shared";
import { newId } from "./ids.js";
import type { Ledger, SegmentRow } from "./ledger.js";

export interface EvergreenStore {
  entries: EvergreenEntry[];
  assetBaseUrl: string;
  states: Map<string, EvergreenRotationState>;
  thresholdFraction: number;
}
/** Boost multiplier while weightUntil is in the future. */
export const EVERGREEN_BOOST_MULTIPLIER = 3;
export function effectiveWeight(entry: EvergreenEntry, nowMs: number): number {
  const base = entry.weight ?? 1;
  if (entry.weightUntil !== undefined && Date.parse(entry.weightUntil) > nowMs)
    return base * EVERGREEN_BOOST_MULTIPLIER;
  return base;
}
/** Highest weight/(1+airCount); variety skips last brand when alternative exists. Ties break by catalog order. */
export function pickNextEvergreen(
  entries: EvergreenEntry[],
  states: Map<string, EvergreenRotationState>,
  lastBrandId: string | null,
  nowMs: number,
): EvergreenEntry | null {
  if (!entries.length) return null;
  const scored = entries.map((entry, index) => ({
    entry,
    index,
    score:
      effectiveWeight(entry, nowMs) /
      (1 + (states.get(entry.id)?.airCount ?? 0)),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  if (lastBrandId !== null) {
    const varied = scored.find((s) => s.entry.brandId !== lastBrandId);
    if (varied) return varied.entry;
  }
  return scored[0]?.entry ?? null;
}
function manifestForEntry(
  entry: EvergreenEntry,
  assetBaseUrl: string,
): MediaManifest {
  const base = assetBaseUrl.replace(/\/$/, "");
  const url = (f: EvergreenMediaFile): string =>
    `${base}/evergreen/media/${f.key}`;
  const audio = entry.media.audio;
  const visual = entry.media.visual;
  return {
    version: 1,
    durationSec: Math.floor(entry.durationSec),
    audio: {
      url: url(audio),
      contentType: audio.contentType,
      sha256: audio.sha256,
    },
    ...(visual
      ? {
          visual: {
            url: url(visual),
            contentType: visual.contentType,
            sha256: visual.sha256,
            type: (visual.kind === "video" ? "video" : "image") as
              "image" | "video",
          },
        }
      : {}),
  };
}
/** Air next entry as a live ready segment. Returns null on empty catalog. */
export function airNextEvergreen(
  store: EvergreenStore,
  ledger: Ledger,
  slot: number,
  nowMs: number = Date.now(),
): { segment: SegmentRow; entry: EvergreenEntry } | null {
  if (!store.entries.length) return null;
  let lastBrandId: string | null = null;
  let latest = -1;
  for (const state of store.states.values()) {
    if (state.lastAiredAtMs !== undefined && state.lastAiredAtMs >= latest) {
      latest = state.lastAiredAtMs;
      lastBrandId =
        store.entries.find((e) => e.id === state.entryId)?.brandId ?? null;
    }
  }
  const entry = pickNextEvergreen(
    store.entries,
    store.states,
    lastBrandId,
    nowMs,
  );
  if (!entry) return null;
  const media = manifestForEntry(entry, store.assetBaseUrl);
  if (!isMediaManifest(media)) return null;
  const segment: SegmentRow = {
    id: newId("seg"),
    slot,
    brandId: entry.brandId,
    bidId: null,
    status: "ready",
    durationSec: Math.floor(entry.durationSec),
    mediaUrl: media.visual?.url ?? media.audio.url,
    media,
    summary: entry.summary,
    thresholdFraction: store.thresholdFraction,
    windowClosed: false,
    brief: entry.brief,
  };
  ledger.segments.set(segment.id, segment);
  const state = store.states.get(entry.id) ?? {
    entryId: entry.id,
    airCount: 0,
  };
  state.airCount += 1;
  state.lastAiredAtMs = nowMs;
  store.states.set(entry.id, state);
  return { segment, entry };
}
