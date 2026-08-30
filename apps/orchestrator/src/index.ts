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

import { ApiClient } from "./apiClient.js";
import { loadEnv } from "./env.js";
import { Gateway } from "./gateway.js";
import { MarketplaceFeed } from "./marketplaceFeed.js";
import { SegmentScheduler } from "./scheduler.js";

const env = loadEnv();

const gateway = new Gateway({ apiBaseUrl: env.apiBaseUrl });
const api = new ApiClient(
  env.apiBaseUrl,
  env.generatorBaseUrl,
  env.orchestratorApiToken,
  env.generatorApiToken,
);

// Marketplace deliveries keep their API eventId (client-side dedupe survives
// API restarts) but are re-stamped into the gateway sequence space.
const feed = new MarketplaceFeed(api, env.eventsPollMs, (event, eventId) => {
  gateway.emit(event, eventId);
});
feed.start();

const scheduler = new SegmentScheduler({ env, gateway, api });
await scheduler.start();

gateway.server.listen(env.port, () => {
  console.log(
    `slopstream orchestrator listening on :${env.port} (api=${env.apiBaseUrl}, generator=${env.generatorBaseUrl}, play=${env.segmentPlaySec}s)`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    scheduler.stop();
    feed.stop();
    void gateway.close().then(() => process.exit(0));
  });
}
