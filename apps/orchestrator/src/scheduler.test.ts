import { describe, expect, it } from "vitest";
import type { ApiClient } from "./apiClient.js";
import type { OrchestratorEnv } from "./env.js";
import type { Gateway } from "./gateway.js";
import { SegmentScheduler } from "./scheduler.js";

const env: OrchestratorEnv = {
  port: 4200,
  apiBaseUrl: "http://api.test",
  generatorBaseUrl: "http://generator.test",
  orchestratorApiToken: "test-orchestrator-token",
  generatorApiToken: "test-generator-token",
  segmentPlaySec: 20,
  auctionPollMs: 2_000,
  eventsPollMs: 750,
  genStageDelayMs: 700,
  generationTimeoutMs: 180_000,
  parallelApiKey: "",
  scraperPollMs: 1_800_000,
  scraperMaxResults: 10,
  alertPollMs: 5_000,
  alertWebhookTimeoutMs: 5_000,
  alertIdleThresholdMs: 10_000,
};

describe("SegmentScheduler metrics", () => {
  it("caps ready and challenge timing to the natural manifest duration", async () => {
    let readyDuration: number | undefined;
    let challengeDuration: number | undefined;
    const scheduler = new SegmentScheduler({
      env: { ...env, genStageDelayMs: 0 },
      gateway: { emit: () => {} } as unknown as Gateway,
      api: {
        markGenerating: async () => {},
        snapshot: async () => {
          throw new Error("market snapshot unavailable");
        },
        generate: async () => ({
          segmentId: "seg_short",
          assetUrl: "https://cdn.test/seg_short.mp3",
          media: {
            version: 1,
            durationSec: 3,
            audio: {
              url: "https://cdn.test/seg_short.mp3",
              contentType: "audio/mpeg",
              sha256: "a".repeat(64),
            },
          },
          durationSec: 3,
          transcript: "Short audio.",
          summary: "Short segment.",
        }),
        markReady: async (
          _segmentId: string,
          body: { durationSec: number },
        ) => {
          readyDuration = body.durationSec;
        },
        sendChallengeSource: async (
          _segmentId: string,
          body: { durationSec: number },
        ) => {
          challengeDuration = body.durationSec;
        },
      } as unknown as ApiClient,
    });
    const internals = scheduler as unknown as {
      runGeneration: (
        target: {
          segmentId: string;
          brandId: string;
          brief: string;
          tier: "audio";
        },
        slot: number,
      ) => Promise<number>;
    };

    await expect(
      internals.runGeneration(
        {
          segmentId: "seg_short",
          brandId: "brand_short",
          brief: "Short audio.",
          tier: "audio",
        },
        1,
      ),
    ).resolves.toBe(3);
    expect(readyDuration).toBe(3);
    expect(challengeDuration).toBe(3);
    scheduler.stop();
  });

  it("marks queue-derived metrics unavailable when the API snapshot fails", async () => {
    const scheduler = new SegmentScheduler({
      env,
      gateway: {} as Gateway,
      api: {
        snapshot: async () => {
          throw new Error("snapshot unavailable");
        },
      } as unknown as ApiClient,
    });
    const internals = scheduler as unknown as {
      generationInFlight: boolean;
      playback: { startedAtMs: number; durationSec: number };
    };
    internals.generationInFlight = true;
    internals.playback = {
      startedAtMs: Date.now() - 7_000,
      durationSec: 20,
    };

    const result = await scheduler.getMetrics();

    expect(result.queue.snapshotAvailable).toBe(false);
    expect(result.queue.upcomingCount).toBe(0);
    expect(result.generation.atRisk).toBe(false);
  });
});
