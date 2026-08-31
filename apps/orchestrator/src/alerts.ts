import type { StreamOpsMetrics } from "@slopstream/shared";

export type AlertKind = "generation.at_risk" | "stream.idle";

export interface AlertDispatcherOptions {
  webhookUrl?: string;
  idleThresholdMs?: number;
  webhookTimeoutMs?: number;
  now?: () => number;
  fetcher?: typeof fetch;
  logger?: (message: string, error?: unknown) => void;
}

export interface OperationalAlert {
  source: "slopstream-orchestrator";
  kind: AlertKind;
  severity: "warning" | "critical";
  occurredAt: string;
  message: string;
  metrics: StreamOpsMetrics;
}

/**
 * Sends operational alerts without coupling alert delivery to playback.
 * Alerts are emitted on state transitions only: one at-risk alert per risk
 * episode and one idle alert after a sustained dead-air interval. A recovery
 * clears the latch so a later incident can alert again. Failed deliveries do
 * not latch an incident, so the next metrics sample retries the notification.
 */
export class AlertDispatcher {
  private readonly webhookUrl?: string;
  private readonly idleThresholdMs: number;
  private readonly webhookTimeoutMs: number;
  private readonly now: () => number;
  private readonly fetcher: typeof fetch;
  private readonly logger: (message: string, error?: unknown) => void;
  private atRiskLatched = false;
  private idleSinceMs?: number;
  private idleLatched = false;

  constructor(options: AlertDispatcherOptions = {}) {
    this.webhookUrl = options.webhookUrl;
    this.idleThresholdMs = options.idleThresholdMs ?? 10_000;
    this.webhookTimeoutMs = options.webhookTimeoutMs ?? 5_000;
    this.now = options.now ?? Date.now;
    this.fetcher = options.fetcher ?? fetch;
    this.logger =
      options.logger ?? ((message, error) => console.warn(message, error));
  }

  /** Observe one metrics sample. Never throws for webhook failures. */
  async observe(metrics: StreamOpsMetrics): Promise<void> {
    // A failed API snapshot makes queue state unknown, not empty. Preserve
    // existing incident latches until a known sample confirms recovery.
    if (!metrics.queue.snapshotAvailable) return;

    if (metrics.generation.atRisk) {
      if (!this.atRiskLatched) {
        const delivered = await this.dispatch(
          this.buildAlert("generation.at_risk", metrics),
        );
        this.atRiskLatched = delivered;
      }
    } else {
      this.atRiskLatched = false;
    }

    const isIdle =
      !metrics.playback.active &&
      !metrics.generation.inFlight &&
      metrics.queue.upcomingCount === 0;
    if (!isIdle) {
      this.idleSinceMs = undefined;
      this.idleLatched = false;
      return;
    }

    const now = this.now();
    this.idleSinceMs ??= now;
    if (!this.idleLatched && now - this.idleSinceMs >= this.idleThresholdMs) {
      const delivered = await this.dispatch(
        this.buildAlert("stream.idle", metrics),
      );
      this.idleLatched = delivered;
    }
  }

  private buildAlert(
    kind: AlertKind,
    metrics: StreamOpsMetrics,
  ): OperationalAlert {
    const atRisk = kind === "generation.at_risk";
    return {
      source: "slopstream-orchestrator",
      kind,
      severity: atRisk ? "warning" : "critical",
      occurredAt: new Date(this.now()).toISOString(),
      message: atRisk
        ? "Generation is at risk of leaving the stream without a ready segment."
        : "The stream has sustained dead air with no active playback or queued segment.",
      metrics,
    };
  }

  private async dispatch(alert: OperationalAlert): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger(`[alerts] ${alert.kind}: ${alert.message}`);
      return true;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.webhookTimeoutMs);
    timeout.unref?.();
    try {
      const response = await this.fetcher(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(alert),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`webhook responded ${response.status}`);
      }
      return true;
    } catch (error) {
      this.logger(`[alerts] failed to dispatch ${alert.kind}`, error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
