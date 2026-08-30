"use client";

import { useEffect, useState } from "react";
import type { StreamOpsMetrics } from "@slopstream/shared";
import { gatewayBaseUrl } from "@/lib/gatewayBaseUrl";

const POLL_MS = 2000;

/**
 * Small ops HUD — polls GET /ops/metrics on the orchestrator gateway.
 * Gated by NEXT_PUBLIC_OPS_HUD=1 for local stream debugging.
 */
export function StreamOpsHud() {
  const enabled = process.env.NEXT_PUBLIC_OPS_HUD === "1";
  const [metrics, setMetrics] = useState<StreamOpsMetrics | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const base = gatewayBaseUrl();
    if (!base) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${base}/ops/metrics`);
        if (response.ok && !cancelled) {
          setMetrics((await response.json()) as StreamOpsMetrics);
        }
      } catch {
        // Gateway may be down during local dev — stay quiet.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled || !metrics) return null;

  const { generation, playback, queue, market } = metrics;
  const genLabel = generation.inFlight
    ? "generating"
    : generation.lastDurationMs
      ? `${Math.round(generation.lastDurationMs / 1000)}s last`
      : "idle";

  return (
    <aside className="stream-ops-hud" aria-label="Stream operations">
      <div className="stream-ops-hud__title">Ops</div>
      <dl className="stream-ops-hud__grid">
        <div>
          <dt>Gen</dt>
          <dd
            className={generation.atRisk ? "stream-ops-hud--warn" : undefined}
          >
            {genLabel}
            {generation.atRisk ? " · at risk" : ""}
          </dd>
        </div>
        <div>
          <dt>Play</dt>
          <dd>
            {playback.active ? `${playback.remainingSec ?? "?"}s left` : "idle"}
          </dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd>
            {queue.upcomingCount} up · {queue.processedSegments} done
          </dd>
        </div>
        <div>
          <dt>Market</dt>
          <dd>
            {market.leaderBrandId
              ? `${market.leaderBrandId} $${market.leaderAmountUsd ?? "?"}`
              : "—"}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
