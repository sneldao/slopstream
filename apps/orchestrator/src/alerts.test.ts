import { describe, expect, it } from "vitest";
import type { StreamOpsMetrics } from "@slopstream/shared";
import { AlertDispatcher } from "./alerts.js";

function metrics(
  overrides: Partial<StreamOpsMetrics["generation"]> & {
    playbackActive?: boolean;
    snapshotAvailable?: boolean;
    upcomingCount?: number;
  } = {},
): StreamOpsMetrics {
  return {
    asOf: new Date(0).toISOString(),
    segmentPlaySec: 20,
    generation: {
      inFlight: false,
      atRisk: false,
      ...overrides,
    },
    playback: { active: overrides.playbackActive ?? false },
    queue: {
      snapshotAvailable: overrides.snapshotAvailable ?? true,
      upcomingCount: overrides.upcomingCount ?? 0,
      processedSegments: 0,
    },
    market: {},
  };
}

describe("AlertDispatcher", () => {
  it("dispatches at-risk only once per incident and alerts again after recovery", async () => {
    const payloads: unknown[] = [];
    const dispatcher = new AlertDispatcher({
      webhookUrl: "https://alerts.test/hook",
      fetcher: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
    });

    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));
    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));
    await dispatcher.observe(metrics({ atRisk: false }));
    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));

    expect(payloads).toHaveLength(2);
    expect((payloads[0] as { kind: string }).kind).toBe("generation.at_risk");
    expect((payloads[1] as { kind: string }).kind).toBe("generation.at_risk");
  });

  it("waits for sustained idle before dispatching and deduplicates the idle alert", async () => {
    let now = 1_000;
    const payloads: unknown[] = [];
    const dispatcher = new AlertDispatcher({
      webhookUrl: "https://alerts.test/hook",
      idleThresholdMs: 5_000,
      now: () => now,
      fetcher: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
    });

    await dispatcher.observe(metrics());
    now += 4_999;
    await dispatcher.observe(metrics());
    expect(payloads).toHaveLength(0);

    now += 1;
    await dispatcher.observe(metrics());
    await dispatcher.observe(metrics());
    expect(payloads).toHaveLength(1);
    expect((payloads[0] as { kind: string }).kind).toBe("stream.idle");

    await dispatcher.observe(metrics({ upcomingCount: 1 }));
    await dispatcher.observe(metrics());
    now += 5_000;
    await dispatcher.observe(metrics());
    expect(payloads).toHaveLength(2);
  });

  it("retries a failed alert delivery on the next sample", async () => {
    let calls = 0;
    const logs: string[] = [];
    const dispatcher = new AlertDispatcher({
      webhookUrl: "https://alerts.test/hook",
      fetcher: async () => {
        calls += 1;
        return new Response(null, { status: 503 });
      },
      logger: (message) => logs.push(message),
    });

    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));
    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));

    expect(calls).toBe(2);
    expect(logs).toHaveLength(2);
  });

  it("preserves delivered incidents while queue metrics are unavailable", async () => {
    const payloads: unknown[] = [];
    const dispatcher = new AlertDispatcher({
      webhookUrl: "https://alerts.test/hook",
      fetcher: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
    });

    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));
    await dispatcher.observe(
      metrics({ snapshotAvailable: false, atRisk: true, inFlight: true }),
    );
    await dispatcher.observe(metrics({ atRisk: true, inFlight: true }));

    expect(payloads).toHaveLength(1);
    expect((payloads[0] as { kind: string }).kind).toBe("generation.at_risk");
  });

  it("aborts a stalled webhook request and keeps alerting isolated", async () => {
    const logs: string[] = [];
    const dispatcher = new AlertDispatcher({
      webhookUrl: "https://alerts.test/hook",
      webhookTimeoutMs: 5,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("request aborted"));
          });
        }),
      logger: (message) => logs.push(message),
    });

    await expect(
      dispatcher.observe(metrics({ atRisk: true, inFlight: true })),
    ).resolves.toBeUndefined();
    expect(logs).toContain("[alerts] failed to dispatch generation.at_risk");
  });
});
