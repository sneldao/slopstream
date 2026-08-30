// Environment loading for @slopstream/api (Lane 2).
// Every field has a hackathon-safe default so `pnpm dev:api` runs with no .env.
// See apps/api/.env.example for the full list.

export interface ApiEnv {
  port: number;
  redisUrl?: string;
  proofVerifierMode: "stub" | "remote";
  proofVerifierUrl?: string;
  defaultListenerPct: number;
  defaultPlatformPct: number;
  /** Seed fictional brands + funded balances so the demo runs cold. */
  seedDemo: boolean;
  /** Explicitly demo-only bearer token for the seeded Acme browser console. */
  demoAcmeBrandToken: string;
  /** Auction window length; the demo script drives this with short windows. */
  auctionDurationSec: number;
  /** Platform-set attention threshold fraction (demo default 0.6). */
  thresholdFraction: number;
  /** Grace period after segment end before the window is evaluated. */
  windowGraceSec: number;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const mode = env.PROOF_VERIFIER_MODE ?? "stub";
  return {
    port: num(env.PORT, 4000),
    redisUrl: env.REDIS_URL || undefined,
    proofVerifierMode: mode === "remote" ? "remote" : "stub",
    proofVerifierUrl: env.PROOF_VERIFIER_URL || undefined,
    defaultListenerPct: num(env.DEFAULT_LISTENER_PERCENTAGE, 0.8),
    defaultPlatformPct: num(env.DEFAULT_PLATFORM_PERCENTAGE, 0.2),
    seedDemo: env.SEED_DEMO !== "0",
    demoAcmeBrandToken:
      env.DEMO_ACME_BRAND_TOKEN ?? "slopstream-demo-acme-token",
    auctionDurationSec: num(env.AUCTION_DURATION_SEC, 60),
    thresholdFraction: num(env.THRESHOLD_FRACTION, 0.6),
    windowGraceSec: num(env.WINDOW_GRACE_SEC, 3),
  };
}
