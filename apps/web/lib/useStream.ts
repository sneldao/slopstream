"use client";

import type { StreamSnapshot, WsDelivery } from "@slopstream/shared";
import {
  reduceStreamEvent,
  snapshotToState,
  type StreamState,
} from "./streamReducer";
import { useLiveStream } from "./useLiveStream";
import type { LiveConnectionStatus } from "./useLiveStream";

/**
 * Unified stream hook — the single entry point all three surfaces use.
 * Fetches `GET /stream/snapshot` then subscribes to the WebSocket gateway.
 * See docs/technical/backend.md "Live event contract".
 */

export interface UseStreamResult {
  state: StreamState;
  connectionStatus: LiveConnectionStatus;
  /** Mirrors useLiveStream.hasEverConnected — lets surfaces label a cold
   *  "offline" as Connecting and a post-drop "offline" as Reconnecting. */
  hasEverConnected: boolean;
}

export function useStream(): UseStreamResult {
  const live = useLiveStream();
  return {
    state: live.state,
    connectionStatus: live.status,
    hasEverConnected: live.hasEverConnected,
  };
}

/** Apply a single delivery to a state — exposed for tests. */
export function applyDelivery(
  prev: StreamState,
  delivery: WsDelivery,
): StreamState {
  return reduceStreamEvent(prev, delivery.event, delivery.sequence);
}

export { snapshotToState };
export type { StreamSnapshot, StreamState };
