// Stream orchestrator bootstrap (Lane 3).
//
// Responsibilities (see docs/technical/architecture.md):
// - WebSocket gateway: the single WS endpoint all screens connect to after
//   loading their REST snapshot, and the reverse proxy for every other REST
//   call. Owns the single delivery sequence space clients see.
// - Marketplace feed: polls Lane 2's GET /events and re-wraps deliveries
//   into the gateway sequence space (bid.*, attention.verified, reward.*,
//   stats.*, leaderboard.*).
// - Segment scheduler: polls auction results from Lane 2, calls the Lane 1
//   generator, and drives the segment lifecycle (generating → ready →
//   playing → challenges → window-closed). Run the API with
//   PUBLISH_LIFECYCLE_EVENTS=0 so the scheduler is the sole emitter of the
//   runtime events (segment.*, generation.progress, challenge.fired).
//
// The orchestrator NEVER resolves auctions or settles money — the backend
// ledger (apps/api) is the single source of truth for both.

import { AlertDispatcher } from "./alerts.js";
import { ApiClient } from "./apiClient.js";
import { loadEnv } from "./env.js";
import { Gateway } from "./gateway.js";
import { MarketplaceFeed } from "./marketplaceFeed.js";
import { CompanyScraper } from "./scraper.js";
import { SegmentScheduler } from "./scheduler.js";

const env = loadEnv();

const gateway = new Gateway({
  apiBaseUrl: env.apiBaseUrl,
  orchestratorApiToken: env.orchestratorApiToken,
});
const api = new ApiClient(
  env.apiBaseUrl,
  env.generatorBaseUrl,
  env.orchestratorApiToken,
  env.generatorApiToken,
  fetch,
  { generationMs: env.generationTimeoutMs },
);

// Marketplace deliveries keep their API eventId (client-side dedupe survives
// API restarts) but are re-stamped into the gateway sequence space.
const feed = new MarketplaceFeed(api, env.eventsPollMs, (event, eventId) => {
  gateway.emit(event, eventId);
});

const scheduler = new SegmentScheduler({ env, gateway, api });
gateway.setMetricsProvider(() => scheduler.getMetrics());

// Cold-start scraper: when PARALLEL_API_KEY is configured, continuously
// discover newly launched companies and ingest them into the API's free-ad
// queue. Without a key the stream falls back to the demo fixture.
let scraper: CompanyScraper | undefined;
if (env.parallelApiKey) {
  scraper = new CompanyScraper({
    apiKey: env.parallelApiKey,
    maxResults: env.scraperMaxResults,
    ingest: async (companies) => {
      const { added, duplicates } = await api.ingestScrapedCompanies(companies);
      console.log(
        `[scraper] ingested ${added} companies (${duplicates} duplicates)`,
      );
    },
  });
} else {
  console.log("[scraper] PARALLEL_API_KEY not set — scraper disabled");
}

let streamPaused = !env.streamEnabled;

const pauseAll = () => {
  if (streamPaused) return;
  streamPaused = true;
  scheduler.pause();
  feed.pause();
  scraper?.pause();
  console.log("[orchestrator] stream paused");
};

const resumeAll = () => {
  if (!streamPaused) return;
  streamPaused = false;
  void (async () => {
    await scheduler.resume();
    feed.resume();
    scraper?.resume();
    console.log("[orchestrator] stream resumed");
  })();
};

gateway.setStreamController({
  pause: pauseAll,
  resume: resumeAll,
  isPaused: () => streamPaused,
});

// Start the subsystems. If the stream is disabled at boot, pause them first.
if (!env.streamEnabled) {
  console.log("[orchestrator] STREAM_ENABLED=false — starting paused");
  pauseAll();
}
feed.start();
await scheduler.start();
scraper?.start(env.scraperPollMs);

const alerts = new AlertDispatcher({
  webhookUrl: env.alertWebhookUrl,
  idleThresholdMs: env.alertIdleThresholdMs,
  webhookTimeoutMs: env.alertWebhookTimeoutMs,
});
let alertTimer: NodeJS.Timeout | undefined;
const pollAlerts = async () => {
  if (streamPaused) return;
  try {
    await alerts.observe(await scheduler.getMetrics());
  } catch (error) {
    // Alerting must never interrupt the stream scheduler.
    console.warn("[alerts] metrics observation failed:", error);
  }
  if (!schedulerStopped) {
    alertTimer = setTimeout(() => void pollAlerts(), env.alertPollMs);
    alertTimer.unref();
  }
};
let schedulerStopped = false;
void pollAlerts();

gateway.server.listen(env.port, () => {
  console.log(
    `slopstream orchestrator listening on :${env.port} (api=${env.apiBaseUrl}, generator=${env.generatorBaseUrl}, play=${env.segmentPlaySec}s)`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    schedulerStopped = true;
    if (alertTimer) clearTimeout(alertTimer);
    scheduler.stop();
    feed.stop();
    scraper?.stop();
    void gateway.close().then(() => process.exit(0));
  });
}
