import type { StreamOpsMetrics } from "@slopstream/shared";

function gauge(name: string, help: string, value: number): string {
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} gauge`,
    `${name} ${value}`,
  ].join("\n");
}

function counter(name: string, help: string, value: number): string {
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`,
    `${name} ${value}`,
  ].join("\n");
}

function optionalGauge(
  name: string,
  help: string,
  value: number | undefined,
): string | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? gauge(name, help, value)
    : undefined;
}

/** Prometheus text exposition of the existing orchestrator ops snapshot. */
export function prometheusMetricsText(metrics: StreamOpsMetrics): string {
  const lines = [
    gauge(
      "slopstream_generation_in_flight",
      "1 when a generation job is currently running.",
      metrics.generation.inFlight ? 1 : 0,
    ),
    gauge(
      "slopstream_generation_at_risk",
      "1 when playback may run dry before the next segment is ready.",
      metrics.generation.atRisk ? 1 : 0,
    ),
    optionalGauge(
      "slopstream_generation_last_duration_ms",
      "Wall-clock duration of the most recent generation in milliseconds.",
      metrics.generation.lastDurationMs,
    ),
    optionalGauge(
      "slopstream_generation_ewma_duration_ms",
      "Smoothed generation duration driving adaptive prefetch depth.",
      metrics.generation.ewmaDurationMs,
    ),
    optionalGauge(
      "slopstream_generation_prefetch_depth",
      "Adaptive number of ready segments the scheduler tries to keep ahead.",
      metrics.generation.prefetchDepth,
    ),
    gauge(
      "slopstream_playback_active",
      "1 when the scheduler currently has an active playout window.",
      metrics.playback.active ? 1 : 0,
    ),
    optionalGauge(
      "slopstream_playback_remaining_seconds",
      "Seconds remaining in the current playout window.",
      metrics.playback.remainingSec,
    ),
    gauge(
      "slopstream_encore_active",
      "1 when dead-air coverage is an orchestrator encore replay.",
      metrics.encore?.active ? 1 : 0,
    ),
    counter(
      "slopstream_encore_plays_total",
      "Count of encore replays since process start.",
      metrics.encore?.totalPlays ?? 0,
    ),
    gauge(
      "slopstream_queue_snapshot_available",
      "1 when queue-derived metrics were computed from a live API snapshot.",
      metrics.queue.snapshotAvailable ? 1 : 0,
    ),
    gauge(
      "slopstream_queue_upcoming_count",
      "Ready/generated segments waiting to play.",
      metrics.queue.upcomingCount,
    ),
    gauge(
      "slopstream_queue_processed_segments",
      "Segments this scheduler process has already driven.",
      metrics.queue.processedSegments,
    ),
    gauge(
      "slopstream_queue_ready_buffer_seconds",
      "Remaining current playout plus upcoming ready durations.",
      metrics.queue.readyBufferSec ?? 0,
    ),
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}
