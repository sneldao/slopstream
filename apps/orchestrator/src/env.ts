// Environment loading for @slopstream/orchestrator (Lane 3).
// Every field has a hackathon-safe default so `pnpm dev:orchestrator` runs
// with no .env — it connects to the default API and generator ports.

export interface OrchestratorEnv {
  /** HTTP + WS gateway port. */
  port: number;
  /** Lane 2 API base URL (default http://localhost:4000). */
  apiBaseUrl: string;
  /** Lane 1 generator base URL (default http://localhost:4300). */
  generatorBaseUrl: string;
  /** Shared credential for orchestrator-only Lane 2 mutations. */
  orchestratorApiToken: string;
  /** Shared credential for invoking the potentially expensive generator. */
  generatorApiToken: string;
  /** Compressed playback length (s). Sent to /ready and /challenge-source as
   *  durationSec and is the real elapsed time before /window-closed — all
   *  three must agree because the verifier enforces challenge windows in
   *  wall-clock time. */
  segmentPlaySec: number;
  /** How often to poll GET /auctions/current for closed slots (ms). */
  auctionPollMs: number;
  /** How often to poll GET /events?after=N for marketplace deliveries (ms). */
  eventsPollMs: number;
  /** Delay between generation.progress stage beats (ms). */
  genStageDelayMs: number;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(name: string, value: number): number {
  if (!(value > 0)) throw new Error(`${name} must be greater than zero`);
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

export function loadEnv(env: NodeJS.ProcessEnv = process.env): OrchestratorEnv {
  return {
    port: positive("PORT", num(env.PORT, 4200)),
    apiBaseUrl: env.API_BASE_URL ?? "http://localhost:4000",
    generatorBaseUrl: env.GENERATOR_BASE_URL ?? "http://localhost:4300",
    orchestratorApiToken: serviceCredential(
      "ORCHESTRATOR_API_TOKEN",
      env.ORCHESTRATOR_API_TOKEN,
      "slopstream-demo-orchestrator-token",
      env,
    ),
    generatorApiToken: serviceCredential(
      "GENERATOR_API_TOKEN",
      env.GENERATOR_API_TOKEN,
      "slopstream-demo-generator-token",
      env,
    ),
    segmentPlaySec: positive("SEGMENT_PLAY_SEC", num(env.SEGMENT_PLAY_SEC, 20)),
    auctionPollMs: positive("AUCTION_POLL_MS", num(env.AUCTION_POLL_MS, 2000)),
    eventsPollMs: positive("EVENTS_POLL_MS", num(env.EVENTS_POLL_MS, 750)),
    genStageDelayMs: positive(
      "GEN_STAGE_DELAY_MS",
      num(env.GEN_STAGE_DELAY_MS, 700),
    ),
  };
}
