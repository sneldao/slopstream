import { describe, expect, it } from "vitest";
import type { StreamOpsMetrics } from "@slopstream/shared";

import { prometheusMetricsText } from "./prometheusMetrics.js";

const metrics: StreamOpsMetrics = {
  asOf: new Date(0).toISOString(),
  segmentPlaySec: 30,
  generation: {
    inFlight: true,
    lastDurationMs: 1200,
    atRisk: true,
    ewmaDurationMs: 900,
    prefetchDepth: 2,
  },
  playback: { active: true, remainingSec: 12.5 },
  encore: { active: false, totalPlays: 3 },
  queue: {
    snapshotAvailable: true,
    upcomingCount: 2,
    processedSegments: 9,
    readyBufferSec: 42.5,
  },
  market: { nextSlotPriceUsd: 5 },
};

describe("prometheusMetricsText", () => {
  it("exposes ready-buffer and generation gauges in Prometheus text format", () => {
    const text = prometheusMetricsText(metrics);
    expect(text).toContain("slopstream_generation_in_flight 1");
    expect(text).toContain("slopstream_generation_at_risk 1");
    expect(text).toContain("slopstream_queue_ready_buffer_seconds 42.5");
    expect(text).toContain("# TYPE slopstream_encore_plays_total counter");
    expect(text).toContain("slopstream_encore_plays_total 3");
    expect(text).toContain("slopstream_playback_remaining_seconds 12.5");
  });
});
