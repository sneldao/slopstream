"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamSnapshot, WsDelivery } from "@slopstream/shared";
import { apiBaseUrl, apiUrl } from "./liveApi";
import {
  reduceStreamEvent,
  snapshotToState,
  type StreamState,
} from "./streamReducer";

/**
 * Live stream client — the real-WebSocket counterpart to the demo player.
 *
 * Flow (see docs/technical/backend.md "Live event contract"):
 *  1. Fetch `GET /stream/snapshot` → authoritative initial `StreamState`.
 *  2. Connect to the WebSocket gateway (`NEXT_PUBLIC_WS_URL` or same-origin
 *     `/ws`). Record `asOfSequence` from the snapshot.
 *  3. On each `WsDelivery`: dedupe by `eventId`, detect sequence gaps, and
 *     apply through the reducer. On a gap or reconnect, re-fetch the snapshot.
 *
 * In demo mode this hook is never used for state (see `useStream`), but it
 * must still be called to satisfy the Rules of Hooks — it short-circuits with
 * a static empty state when no snapshot URL is configured.
 */

const SNAPSHOT_PATH = "/stream/snapshot";
const DEFAULT_WS_PATH = "/ws";

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
  brands: [],
  leaderboard: [],
  nextSlotPriceUsd: 0,
  listeners: 0,
  attentionProofs: 0,
  listenerRewardsUsd: 0,
});

export function useLiveStream(enabled = true): StreamState {
  const [state, setState] = useState<StreamState>(EMPTY_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const lastSequence = useRef<number>(0);
  const stopped = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async (): Promise<StreamState | null> => {
    try {
      const res = await fetch(apiUrl(SNAPSHOT_PATH));
      if (!res.ok) return null;
      const snapshot = (await res.json()) as StreamSnapshot;
      const next = snapshotToState(snapshot);
      lastSequence.current = snapshot.asOfSequence;
      seenEventIds.current = new Set();
      setState(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const connect = useCallback(
    (fromSequence: number) => {
      const url = resolveWsUrl(fromSequence);
      if (!url || stopped.current) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

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
          if (delivery.sequence > fromSequence + 1 && fromSequence > 0) {
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
        // Reconnect after a short backoff; the snapshot fetch on reconnect
        // handles any missed events.
        reconnectTimer.current = setTimeout(
          () => void fetchSnapshot().then((s) => s && connect(s.asOfSequence)),
          1500,
        );
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [fetchSnapshot],
  );

  useEffect(() => {
    // Only attempt live connection if a snapshot URL is resolvable.
    // In demo mode this env var is unset, so the hook stays inert.
    if (!enabled || (!apiBaseUrl() && !process.env.NEXT_PUBLIC_WS_URL)) {
      return;
    }
    stopped.current = false;
    void fetchSnapshot().then((s) => {
      if (s) connect(s.asOfSequence);
    });

    return () => {
      stopped.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, fetchSnapshot, connect]);

  return state;
}
