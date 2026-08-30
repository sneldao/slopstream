"use client";

import { useMemo } from "react";
import type { StreamSnapshot, WsDelivery } from "@slopstream/shared";
import {
  reduceStreamEvent,
  snapshotToState,
  type StreamState,
} from "./streamReducer";
import { useDemoPlayer } from "./useDemoPlayer";
import { useLiveStream } from "./useLiveStream";
import { DEMO_FIXTURE } from "./demoFixture";

/**
 * Unified stream hook — the single entry point all three surfaces (big screen,
 * listener, brand console) use to get `StreamState`. Picks demo vs live based
 * on `NEXT_PUBLIC_STREAM_MODE`:
 *
 *  - `demo` (default): plays the fixture from `demoFixture.ts`. No backend.
 *  - `live`: fetches `GET /stream/snapshot` then subscribes to the WebSocket
 *    gateway at `NEXT_PUBLIC_WS_URL` (or same-origin `/ws`). Applies events
 *    through the same reducer.
 *
 * The returned shape is identical either way, so swapping demo → live is an
 * env-var change with no code edits. See docs/technical/backend.md "Live
 * event contract".
 */
export type StreamMode = "demo" | "live";

export function getStreamMode(): StreamMode {
  const raw = process.env.NEXT_PUBLIC_STREAM_MODE;
  return raw === "live" ? "live" : "demo";
}

export interface UseStreamResult {
  state: StreamState;
  mode: StreamMode;
  /** Demo-only controls; no-op when live (the socket drives the state). */
  demo: ReturnType<typeof useDemoPlayer>;
}

export function useStream(): UseStreamResult {
  const mode = useMemo(() => getStreamMode(), []);

  // Always call both hooks (Rules of Hooks), but only use the relevant one's
  // state. The unused hook's timers are harmless in demo mode; in live mode
  // the demo player runs but its state is ignored.
  const demo = useDemoPlayer(DEMO_FIXTURE);
  const live = useLiveStream();

  const state = mode === "live" ? live : demo.state;
  return { state, mode, demo };
}

/**
 * Apply a single delivery to a state — used by the live hook and exposed for
 * testing. Demo mode doesn't call this directly (the player does internally).
 */
export function applyDelivery(
  prev: StreamState,
  delivery: WsDelivery,
): StreamState {
  return reduceStreamEvent(prev, delivery.event, delivery.sequence);
}

export { snapshotToState };
export type { StreamSnapshot, StreamState };
