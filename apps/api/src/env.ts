// Environment loading for @slopstream/api (Lane 2).
// Every field has a hackathon-safe default so `pnpm dev:api` runs with no .env.
// See apps/api/.env.example for the full list.

export interface ApiEnv {
  port: number;
  redisUrl?: string;
  proofVerifierMode: "stub" | "remote";
  proofVerifierUrl?: string;
  proofVerifierToken?: string;
  defaultListenerPct: number;
  defaultPlatformPct: number;
  /** Seed fictional brands + funded balances so the demo runs cold. */
  seedDemo: boolean;
  /** Explicitly demo-only bearer token for the seeded Acme browser console. */
  demoAcmeBrandToken: string;
  /** Shared bearer credential accepted only from the stream orchestrator. */
  orchestratorApiToken: string;
  /** Auction window length; the demo script drives this with short windows. */
  auctionDurationSec: number;
  /** Platform-set attention threshold fraction (demo default 0.6). */
  thresholdFraction: number;
  /** Grace period after segment end before the window is evaluated. */
  windowGraceSec: number;
  /** A listener must have touched its session within this interval to count. */
  activeListenerWindowSec: number;
  /**
   * Publish segment.* / challenge.fired from the lifecycle endpoints.
   * Set PUBLISH_LIFECYCLE_EVENTS=0 when the Lane 3 orchestrator emits those
   * events itself — exactly one emitter per WsEvent.
   */
  publishLifecycleEvents: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(name: string, value: number): number {
  if (!(value > 0)) throw new Error(`${name} must be greater than zero`);
  return value;
}

function nonNegative(name: string, value: number): number {
  if (value < 0) throw new Error(`${name} must not be negative`);
  return value;
}

function fraction(name: string, value: number): number {
  if (value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
  return value;
}

function serviceCredential(
  name: string,
  value: string | undefined,
  fallback: string,
  env: NodeJS.ProcessEnv,
): string {
  const configured = value?.trim();
  if (
    env.NODE_ENV === "production" &&
    (!configured || configured === fallback)
  ) {
    throw new Error(`${name} must be set in production`);
  }
  return configured || fallback;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const mode = env.PROOF_VERIFIER_MODE ?? "stub";
  if (mode !== "stub" && mode !== "remote") {
    throw new Error(`Unsupported PROOF_VERIFIER_MODE=${mode}`);
  }
  const listenerPct = fraction(
    "DEFAULT_LISTENER_PERCENTAGE",
    num(env.DEFAULT_LISTENER_PERCENTAGE, 0.8),
  );
  const platformPct = fraction(
    "DEFAULT_PLATFORM_PERCENTAGE",
    num(env.DEFAULT_PLATFORM_PERCENTAGE, 0.2),
  );
  if (Math.abs(listenerPct + platformPct - 1) > Number.EPSILON * 10) {
    throw new Error(
      "DEFAULT_LISTENER_PERCENTAGE and DEFAULT_PLATFORM_PERCENTAGE must sum to 1",
    );
  }
  return {
    port: positive("PORT", num(env.PORT, 4000)),
    redisUrl: env.REDIS_URL || undefined,
    proofVerifierMode: mode,
    proofVerifierUrl: env.PROOF_VERIFIER_URL || undefined,
    proofVerifierToken: env.PROOF_VERIFIER_TOKEN || undefined,
    defaultListenerPct: listenerPct,
    defaultPlatformPct: platformPct,
    seedDemo: env.SEED_DEMO !== "0",
    demoAcmeBrandToken:
      env.DEMO_ACME_BRAND_TOKEN ?? "slopstream-demo-acme-token",
    orchestratorApiToken: serviceCredential(
      "ORCHESTRATOR_API_TOKEN",
      env.ORCHESTRATOR_API_TOKEN,
      "slopstream-demo-orchestrator-token",
      env,
    ),
    auctionDurationSec: positive(
      "AUCTION_DURATION_SEC",
      num(env.AUCTION_DURATION_SEC, 60),
    ),
    thresholdFraction: fraction(
      "THRESHOLD_FRACTION",
      num(env.THRESHOLD_FRACTION, 0.6),
    ),
    windowGraceSec: nonNegative(
      "WINDOW_GRACE_SEC",
      num(env.WINDOW_GRACE_SEC, 3),
    ),
    activeListenerWindowSec: positive(
      "ACTIVE_LISTENER_WINDOW_SEC",
      num(env.ACTIVE_LISTENER_WINDOW_SEC, 120),
    ),
    publishLifecycleEvents: env.PUBLISH_LIFECYCLE_EVENTS !== "0",
  };
}
