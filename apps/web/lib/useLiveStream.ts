"use client";

import { useEffect, useRef, useState } from "react";
import type { StreamSnapshot, WsDelivery } from "@slopstream/shared";
import { apiUrl } from "./liveApi";
import {
  reduceStreamEvent,
  snapshotToState,
  type StreamState,
} from "./streamReducer";

/**
 * Live stream client — snapshot + WebSocket gateway.
 *
 * Flow (see docs/technical/backend.md "Live event contract"):
 *  1. Fetch `GET /stream/snapshot` → authoritative initial `StreamState`.
 *  2. Connect to the WebSocket gateway (`NEXT_PUBLIC_WS_URL` or same-origin
 *     `/ws`). Record `asOfSequence` from the snapshot.
 *  3. On each `WsDelivery`: dedupe by `eventId`, detect sequence gaps, and
 *     apply through the reducer. On a gap or reconnect, re-fetch the snapshot.
 */

const SNAPSHOT_PATH = "/stream/snapshot";
const DEFAULT_WS_PATH = "/ws";
const RETRY_MS = 1500;

function resolveWsUrl(afterSequence: number): string | null {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) {
    const url = new URL(explicit);
    url.searchParams.set("after", String(afterSequence));
    return url.toString();
  }
  // Derive ws:// or wss:// from the current origin by default.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${DEFAULT_WS_PATH}?after=${afterSequence}`;
  }
  return null;
}

const EMPTY_STATE: StreamState = snapshotToState({
  asOfSequence: 0,
  nowPlaying: null,
  recentSegments: [],
  upcomingSegments: [],
  brands: [],
  leaderboard: [],
  nextSlotPriceUsd: 0,
  listeners: 0,
  attentionProofs: 0,
  listenerRewardsUsd: 0,
  totalClearedVolumeUsd: 0,
  placedVolumeUsd: 0,
});

export type LiveConnectionStatus =
  "idle" | "connecting" | "connected" | "offline";

export interface LiveStreamResult {
  state: StreamState;
  status: LiveConnectionStatus;
  /** True once the socket has ever opened — distinguishes a first-time
   *  "Connecting" from a post-drop "Reconnecting" on the offline path. */
  hasEverConnected: boolean;
}

export function useLiveStream(): LiveStreamResult {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting");
  const [hasEverConnected, setHasEverConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const lastSequence = useRef<number>(0);
  const stopped = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchSnapshot = async (): Promise<number | null> => {
      try {
        const res = await fetch(apiUrl(SNAPSHOT_PATH));
        if (!res.ok) {
          setStatus("offline");
          return null;
        }
        const snapshot = (await res.json()) as StreamSnapshot;
        lastSequence.current = snapshot.asOfSequence;
        seenEventIds.current = new Set();
        setState(snapshotToState(snapshot));
        setStatus("connecting");
        return snapshot.asOfSequence;
      } catch {
        setStatus("offline");
        return null;
      }
    };

    const scheduleRetry = (then: () => void) => {
      if (stopped.current) return;
      reconnectTimer.current = setTimeout(then, RETRY_MS);
    };

    const attempt = () => {
      if (stopped.current) return;
      // Retries keep the last label — otherwise a dead feed flaps between
      // "Connecting" and "No signal" on every cycle.
      setStatus((prev) => (prev === "offline" ? prev : "connecting"));
      void fetchSnapshot().then((asOfSequence) => {
        if (stopped.current) return;
        // A snapshot that never loaded still needs retrying — otherwise the
        // first failure ends the conversation and the client sits claiming to
        // be connecting forever.
        if (asOfSequence === null) scheduleRetry(attempt);
        else connect(asOfSequence);
      });
    };

    function connect(fromSequence: number): void {
      const url = resolveWsUrl(fromSequence);
      if (!url || stopped.current) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        setHasEverConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const delivery = JSON.parse(ev.data) as WsDelivery;
          // The snapshot is authoritative through fromSequence. Never replay
          // retained history over it after an initial connect or reconnect.
          if (delivery.sequence <= fromSequence) return;
          // Dedupe by eventId.
          if (seenEventIds.current.has(delivery.eventId)) return;
          seenEventIds.current.add(delivery.eventId);

          // Detect a sequence gap → re-fetch snapshot and bail.
          if (delivery.sequence > fromSequence + 1) {
            ws.close();
            return;
          }
          fromSequence = delivery.sequence;
          lastSequence.current = delivery.sequence;

          setState((prev) =>
            reduceStreamEvent(prev, delivery.event, delivery.sequence),
          );
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (stopped.current) return;
        setStatus("offline");
        // The snapshot fetch on reconnect handles any missed events.
        scheduleRetry(attempt);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    stopped.current = false;
    attempt();

    return () => {
      stopped.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { state, status, hasEverConnected };
}
