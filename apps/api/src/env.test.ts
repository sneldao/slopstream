import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

describe("API environment validation", () => {
  it("accepts the safe local defaults", () => {
    expect(loadEnv({} as NodeJS.ProcessEnv)).toMatchObject({
      defaultListenerPct: 0.8,
      defaultPlatformPct: 0.2,
      activeListenerWindowSec: 120,
    });
  });

  it("rejects reward percentages that can over-distribute spend", () => {
    expect(() =>
      loadEnv({
        DEFAULT_LISTENER_PERCENTAGE: "0.9",
        DEFAULT_PLATFORM_PERCENTAGE: "0.2",
      } as NodeJS.ProcessEnv),
    ).toThrow(/must sum to 1/);
  });

  it("rejects invalid thresholds and unknown verifier modes", () => {
    expect(() =>
      loadEnv({ THRESHOLD_FRACTION: "1.2" } as NodeJS.ProcessEnv),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      loadEnv({ PROOF_VERIFIER_MODE: "midnight" } as NodeJS.ProcessEnv),
    ).toThrow(/Unsupported/);
  });

  it("requires an explicit orchestrator credential in production", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/ORCHESTRATOR_API_TOKEN must be set/);
  });
});
