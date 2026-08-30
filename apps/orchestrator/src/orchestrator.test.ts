import { EventEmitter } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, type AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import type {
  PublicChallenge,
  Segment,
  StreamSnapshot,
  WsDelivery,
} from "@slopstream/shared";
import { ApiClient } from "./apiClient.js";
import { loadEnv, type OrchestratorEnv } from "./env.js";
import { Gateway } from "./gateway.js";
import { MarketplaceFeed, resolveBatch } from "./marketplaceFeed.js";
import { SegmentScheduler } from "./scheduler.js";

const SEGMENT_ID = "seg_test_1";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // Tolerate already-closed servers (the dead-generator test closes early).
    server.close(() => resolve());
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

// ---------------------------------------------------------------------------
// resolveBatch — pure cursor logic
// ---------------------------------------------------------------------------

describe("orchestrator environment", () => {
  it("requires explicit service credentials in production", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/ORCHESTRATOR_API_TOKEN must be set/);
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        ORCHESTRATOR_API_TOKEN: "orchestrator-secret",
      } as NodeJS.ProcessEnv),
    ).toThrow(/GENERATOR_API_TOKEN must be set/);
  });
});

describe("resolveBatch cursor logic", () => {
  it("forwards past the cursor", () => {
    const result = resolveBatch(5, {
      deliveries: [
        {
          eventId: "a",
          sequence: 6,
          event: {
            type: "stats.updated",
            listeners: 1,
            attentionProofs: 0,
            listenerRewardsUsd: 0,
          },
        },
        {
          eventId: "b",
          sequence: 7,
          event: {
            type: "stats.updated",
            listeners: 2,
            attentionProofs: 0,
            listenerRewardsUsd: 0,
          },
        },
      ],
      asOfSequence: 7,
    });
    expect(result.reset).toBe(false);
    expect(result.deliveries.map((d) => d.eventId)).toEqual(["a", "b"]);
    expect(result.nextCursor).toBe(7);
  });

  it("resets the cursor when the API sequence space rewinds", () => {
    const result = resolveBatch(100, {
      deliveries: [
        {
          eventId: "a",
          sequence: 1,
          event: {
            type: "stats.updated",
            listeners: 1,
            attentionProofs: 0,
            listenerRewardsUsd: 0,
          },
        },
      ],
      asOfSequence: 1,
    });
    expect(result.reset).toBe(true);
    expect(result.nextCursor).toBe(1);
    expect(result.deliveries).toHaveLength(1);
  });

  it("filters duplicates already past the cursor", () => {
    const result = resolveBatch(5, {
      deliveries: [
        {
          eventId: "old",
          sequence: 5,
          event: {
            type: "stats.updated",
            listeners: 1,
            attentionProofs: 0,
            listenerRewardsUsd: 0,
          },
        },
        {
          eventId: "new",
          sequence: 6,
          event: {
            type: "stats.updated",
            listeners: 2,
            attentionProofs: 0,
            listenerRewardsUsd: 0,
          },
        },
      ],
      asOfSequence: 6,
    });
    expect(result.deliveries.map((d) => d.eventId)).toEqual(["new"]);
    expect(result.nextCursor).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// End-to-end orchestrator run against fake Lane 2 + fake generator
// ---------------------------------------------------------------------------

interface FakeApi {
  server: Server;
  lifecycleCalls: string[];
  bodies: { path: string; body: Record<string, unknown> }[];
  auth: { last: string | undefined };
}

function createFakeApi(options?: { failFirstFailedCall?: boolean }): FakeApi {
  const lifecycleCalls: string[] = [];
  const bodies: { path: string; body: Record<string, unknown> }[] = [];
  const auth = { last: undefined as string | undefined };
  let challengePulls = 0;
  let failedCalls = 0;
  let auctionsFlipped = false;
  setTimeout(() => {
    auctionsFlipped = true;
  }, 300);

  const marketplaceDelivery: WsDelivery = {
    eventId: "api-evt-1",
    sequence: 1,
    event: {
      type: "stats.updated",
      listeners: 3,
      attentionProofs: 1,
      listenerRewardsUsd: 0.5,
    },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && url.pathname === "/auctions/current") {
      const slot = auctionsFlipped ? 2 : 1;
      json(200, {
        slot,
        status: "open",
        closesAt: new Date(Date.now() + 60_000).toISOString(),
        nextSlotPriceUsd: 5,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auctions/1") {
      json(200, {
        slot: 1,
        status: "closed",
        closesAt: new Date().toISOString(),
        nextSlotPriceUsd: 5,
        winner: {
          bidId: "bid_1",
          brandId: "brand_test",
          amountUsd: 10,
          tier: "audio",
          brief: "A test brief",
          segmentId: SEGMENT_ID,
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/stream/snapshot") {
      const snapshot: StreamSnapshot = {
        // Deliberately a foreign value: the gateway must overwrite it with
        // its own sequence.
        asOfSequence: 999,
        nowPlaying: null,
        recentSegments: [],
        upcomingSegments: [],
        brands: [],
        leaderboard: [],
        nextSlotPriceUsd: 5,
        listeners: 0,
        attentionProofs: 0,
        listenerRewardsUsd: 0,
      };
      json(200, snapshot);
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const after = Number(url.searchParams.get("after") ?? 0);
      json(200, {
        deliveries: after < 1 ? [marketplaceDelivery] : [],
        asOfSequence: 1,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/generations") {
      json(200, {});
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/segments/")) {
      const path = url.pathname.replace(`/segments/${SEGMENT_ID}`, "");
      lifecycleCalls.push(path);
      auth.last = req.headers.authorization;
      const raw = await readBody(req);
      bodies.push({
        path,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });

      if (path === "/failed") {
        failedCalls += 1;
        if (options?.failFirstFailedCall && failedCalls === 1) {
          json(500, { error: "transient failure" });
          return;
        }
      }

      if (path === "/challenges/next") {
        challengePulls += 1;
        if (challengePulls > 2) {
          json(404, { error: "no unfired challenges remain" });
          return;
        }
        json(200, {
          challenge: {
            id: `ch_${challengePulls}`,
            type: "recall",
            question: `Question ${challengePulls}?`,
            segmentId: SEGMENT_ID,
            validFrom: 0,
            validUntil: 20,
            difficulty: 1,
          },
        });
        return;
      }

      if (path === "/playing") {
        json(200, {
          segmentId: SEGMENT_ID,
          startedAt: new Date().toISOString(),
          attentionThreshold: 1,
        });
        return;
      }

      json(200, { segmentId: SEGMENT_ID });
      return;
    }

    json(404, { error: "not found" });
  });

  return { server, lifecycleCalls, bodies, auth };
}

function createFakeGenerator(): { server: Server; requests: unknown[] } {
  const requests: unknown[] = [];
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const request = JSON.parse(body) as { segmentId: string };
    requests.push(request);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        segmentId: request.segmentId,
        assetUrl: "https://cdn.test/asset.mp4",
        durationSec: 30,
        transcript: "Zephyr Quantum delivers blazing fast pipelines",
        summary: "A test summary",
      }),
    );
  });
  return { server, requests };
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("waitFor timed out"));
      }
      setTimeout(check, 25);
    };
    check();
  });
}

describe("gateway ops metrics", () => {
  it("returns scheduler metrics from GET /ops/metrics", async () => {
    const gateway = new Gateway({ apiBaseUrl: "http://unused.test" });
    gateway.setMetricsProvider(async () => ({
      asOf: new Date().toISOString(),
      segmentPlaySec: 30,
      generation: {
        inFlight: false,
        lastDurationMs: 1200,
        lastSegmentId: SEGMENT_ID,
        atRisk: false,
      },
      playback: { active: false },
      queue: { upcomingCount: 0, processedSegments: 1 },
      market: { nextSlotPriceUsd: 5 },
    }));
    const gatewayBaseUrl = await listen(gateway.server);
    try {
      const response = await fetch(`${gatewayBaseUrl}/ops/metrics`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        segmentPlaySec: 30,
        generation: { lastSegmentId: SEGMENT_ID },
      });
    } finally {
      await gateway.close();
    }
  });
});

describe("gateway replay cursor", () => {
  it("replays only deliveries newer than the snapshot cursor", async () => {
    const replayGateway = new Gateway({ apiBaseUrl: "http://unused.test" });
    const gatewayBaseUrl = await listen(replayGateway.server);
    replayGateway.emit({
      type: "stats.updated",
      listeners: 1,
      attentionProofs: 0,
      listenerRewardsUsd: 0,
    });
    replayGateway.emit({
      type: "stats.updated",
      listeners: 2,
      attentionProofs: 0,
      listenerRewardsUsd: 0,
    });

    const deliveries: WsDelivery[] = [];
    const ws = new WebSocket(`${gatewayBaseUrl.replace("http", "ws")}?after=1`);
    ws.on("message", (data) => {
      deliveries.push(JSON.parse(data.toString()) as WsDelivery);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        ws.on("open", resolve);
        ws.on("error", reject);
      });
      await waitFor(() => deliveries.length === 1, 1_000);
      expect(deliveries.map((delivery) => delivery.sequence)).toEqual([2]);
    } finally {
      ws.close();
      await replayGateway.close();
    }
  });
});

describe("gateway aborted request body", () => {
  it("survives a socket destroyed mid-body and keeps serving", async () => {
    const gateway = new Gateway({
      apiBaseUrl: "http://unused.test",
      // Never reached: the socket dies before the body read completes.
      fetcher: () => new Promise<Response>(() => {}),
    });
    const gatewayBaseUrl = await listen(gateway.server);
    const port = Number(new URL(gatewayBaseUrl).port);
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: "127.0.0.1", port }, () => {
          socket.write(
            "POST /segments/seg_1/generating HTTP/1.1\r\n" +
              "Host: 127.0.0.1\r\n" +
              "Content-Type: application/json\r\n" +
              "Content-Length: 100\r\n" +
              "\r\n" +
              '{"partial":',
          );
          // Kill the connection mid-body: the proxy's body iteration
          // throws and must be caught, not crash the server.
          socket.destroy();
          resolve();
        });
        socket.on("error", reject);
      });
      // Give the server a beat to process the abort, then prove it is alive.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const health = await fetch(`${gatewayBaseUrl}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({ ok: true });
    } finally {
      await gateway.close();
    }
  });

  it("answers 5xx when the body stream errors mid-iteration (proxy level)", async () => {
    const gateway = new Gateway({ apiBaseUrl: "http://unused.test" });
    try {
      const stream = new EventEmitter() as unknown as IncomingMessage &
        EventEmitter;
      stream.method = "POST";
      stream.headers = { "content-type": "application/json" };
      // Throw from the async iteration itself, like a client disconnect.
      (stream as unknown as { [Symbol.asyncIterator]: unknown })[
        Symbol.asyncIterator
      ] = async function* () {
        yield Buffer.from('{"partial":');
        throw new Error("aborted");
      };

      let ended = false;
      let endedData = "";
      const res = {
        headersSent: false,
        writableEnded: false,
        writeHead(status: number) {
          expect(status).toBeGreaterThanOrEqual(500);
          return this;
        },
        end(data?: string) {
          ended = true;
          endedData = data ?? "";
          return this;
        },
        destroy() {},
      } as unknown as ServerResponse;

      await (
        gateway as unknown as {
          proxy: (
            req: IncomingMessage,
            res: ServerResponse,
            url: URL,
          ) => Promise<void>;
        }
      ).proxy(
        stream as unknown as IncomingMessage,
        res,
        new URL("http://localhost/segments/seg_1/generating"),
      );
      expect(ended).toBe(true);
      expect(endedData).toContain("error");
    } finally {
      await gateway.close();
    }
  });
});

describe("orchestrator live slice", () => {
  let fakeApi: FakeApi;
  let fakeGenerator: { server: Server; requests: unknown[] };
  let gateway: Gateway;
  let feed: MarketplaceFeed;
  let scheduler: SegmentScheduler;
  let gatewayPort = 0;

  afterEach(async () => {
    scheduler.stop();
    feed.stop();
    await gateway.close();
    await Promise.all([close(fakeApi.server), close(fakeGenerator.server)]);
  });

  it("drives a won slot end-to-end through one gateway sequence space", async () => {
    fakeApi = createFakeApi();
    fakeGenerator = createFakeGenerator();
    const [apiBaseUrl, generatorBaseUrl] = await Promise.all([
      listen(fakeApi.server),
      listen(fakeGenerator.server),
    ]);

    const env: OrchestratorEnv = {
      port: 0,
      apiBaseUrl,
      generatorBaseUrl,
      orchestratorApiToken: "test-orchestrator-token",
      generatorApiToken: "test-generator-token",
      segmentPlaySec: 1,
      auctionPollMs: 25,
      eventsPollMs: 25,
      genStageDelayMs: 5,
      generationTimeoutMs: 180_000,
      parallelApiKey: "",
      scraperPollMs: 60_000,
      scraperMaxResults: 10,
    };

    gateway = new Gateway({ apiBaseUrl });
    const api = new ApiClient(
      apiBaseUrl,
      generatorBaseUrl,
      env.orchestratorApiToken,
      env.generatorApiToken,
    );
    feed = new MarketplaceFeed(api, env.eventsPollMs, (event, eventId) => {
      gateway.emit(event, eventId);
    });
    scheduler = new SegmentScheduler({ env, gateway, api });

    await new Promise<void>((resolve) => {
      gateway.server.listen(0, resolve);
    });
    gatewayPort = (gateway.server.address() as AddressInfo).port;

    feed.start();
    await scheduler.start();

    // Raw WS client — no path suffix, exactly like apps/web connects.
    const deliveries: WsDelivery[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}`);
    ws.on("message", (data) => {
      deliveries.push(JSON.parse(data.toString()) as WsDelivery);
    });
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Wait for the window to close: lifecycle calls end with /window-closed.
    await waitFor(
      () => fakeApi.lifecycleCalls.at(-1) === "/window-closed",
      8000,
    );
    // Let the final broadcasts flush to the client.
    await new Promise((resolve) => setTimeout(resolve, 200));
    ws.close();

    // 1. Marketplace passthrough keeps the API eventId but gets a gateway
    //    sequence, and runtime events interleave in lifecycle order.
    const stats = deliveries.find((d) => d.event.type === "stats.updated");
    expect(stats?.eventId).toBe("api-evt-1");

    const types = deliveries.map((d) => d.event.type);
    const lifecycle = types.filter((t) => t !== "stats.updated");
    expect(lifecycle).toEqual([
      "segment.generating",
      "generation.progress",
      "generation.progress",
      "generation.progress",
      "generation.progress",
      "segment.ready",
      "segment.playing",
      "challenge.fired",
      "challenge.fired",
    ]);

    const stages = deliveries
      .filter((d) => d.event.type === "generation.progress")
      .map((d) => (d.event as { stage: string }).stage);
    expect(stages).toEqual(["script", "voice", "image", "video"]);

    // 2. One monotonic sequence space across marketplace + runtime events.
    const sequences = deliveries.map((d) => d.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);

    // 3. Lane 2 lifecycle calls land in the contract order, ending with
    //    window-closed; challenge pulls include the exhausting 404 pull.
    expect(fakeApi.lifecycleCalls).toEqual([
      "/generating",
      "/ready",
      "/challenge-source",
      "/playing",
      "/challenges/next",
      "/challenges/next",
      "/challenges/next",
      "/window-closed",
    ]);
    expect(fakeApi.auth.last).toBe("Bearer test-orchestrator-token");

    // 4. Compressed playback: /ready and /challenge-source received
    //    segmentPlaySec (1), not the generator's durationSec (30).
    const readyBody = fakeApi.bodies.find((r) => r.path === "/ready")?.body;
    expect(readyBody).toMatchObject({
      durationSec: 1,
      assetUrl: "https://cdn.test/asset.mp4",
    });
    const sourceBody = fakeApi.bodies.find(
      (r) => r.path === "/challenge-source",
    )?.body;
    expect(sourceBody).toMatchObject({
      durationSec: 1,
      transcript: "Zephyr Quantum delivers blazing fast pipelines",
    });

    // 5. The gateway overwrites the snapshot's asOfSequence with its own,
    //    and it advances as events are emitted.
    const snapRes = await fetch(
      `http://127.0.0.1:${gatewayPort}/stream/snapshot`,
    );
    const snapshot = (await snapRes.json()) as StreamSnapshot;
    expect(snapshot.asOfSequence).toBe(gateway.currentSequence);
    expect(snapshot.asOfSequence).toBeGreaterThan(0);
    expect(snapshot.asOfSequence).not.toBe(999);
  }, 15_000);

  it("survives a dead generator and tells Lane 2 the segment failed", async () => {
    fakeApi = createFakeApi();
    fakeGenerator = createFakeGenerator();
    const apiBaseUrl = await listen(fakeApi.server);
    await listen(fakeGenerator.server);
    // Kill it so generate() gets ECONNREFUSED while the progress beats run —
    // the rejection must be handled, not crash the process.
    await close(fakeGenerator.server);

    const env: OrchestratorEnv = {
      port: 0,
      apiBaseUrl,
      generatorBaseUrl: "http://127.0.0.1:1",
      orchestratorApiToken: "test-orchestrator-token",
      generatorApiToken: "test-generator-token",
      segmentPlaySec: 1,
      auctionPollMs: 25,
      eventsPollMs: 60_000,
      genStageDelayMs: 5,
      generationTimeoutMs: 180_000,
      parallelApiKey: "",
      scraperPollMs: 60_000,
      scraperMaxResults: 10,
    };

    gateway = new Gateway({ apiBaseUrl });
    const api = new ApiClient(
      apiBaseUrl,
      env.generatorBaseUrl,
      env.orchestratorApiToken,
      env.generatorApiToken,
    );
    feed = new MarketplaceFeed(api, env.eventsPollMs, () => {});
    scheduler = new SegmentScheduler({ env, gateway, api });
    feed.start();
    await scheduler.start();

    await waitFor(() => fakeApi.lifecycleCalls.includes("/failed"), 8000);
    expect(fakeApi.lifecycleCalls).toEqual(["/generating", "/failed"]);
  }, 15_000);

  it("proxies REST calls (method, path, auth header) to the API", async () => {
    fakeApi = createFakeApi();
    fakeGenerator = createFakeGenerator();
    const apiBaseUrl = await listen(fakeApi.server);
    fakeGenerator.server.listen(0);

    const gatewayEnv = { apiBaseUrl };
    gateway = new Gateway(gatewayEnv);
    const api = new ApiClient(apiBaseUrl, "http://unused");
    feed = new MarketplaceFeed(api, 60_000, () => {});
    scheduler = new SegmentScheduler({
      env: {
        port: 0,
        apiBaseUrl,
        generatorBaseUrl: "http://unused",
        orchestratorApiToken: "test-orchestrator-token",
        generatorApiToken: "test-generator-token",
        segmentPlaySec: 1,
        auctionPollMs: 60_000,
        eventsPollMs: 60_000,
        genStageDelayMs: 5,
        generationTimeoutMs: 180_000,
        parallelApiKey: "",
        scraperPollMs: 60_000,
        scraperMaxResults: 10,
      },
      gateway,
      api,
    });

    await new Promise<void>((resolve) => {
      gateway.server.listen(0, resolve);
    });
    gatewayPort = (gateway.server.address() as AddressInfo).port;

    // A GET proxied through the gateway.
    const auctionRes = await fetch(
      `http://127.0.0.1:${gatewayPort}/auctions/current`,
    );
    expect(auctionRes.status).toBe(200);
    expect((await auctionRes.json()).slot).toBe(1);
    expect(auctionRes.headers.get("access-control-allow-origin")).toBe("*");

    // OPTIONS preflight is answered locally.
    const preflight = await fetch(`http://127.0.0.1:${gatewayPort}/brands`, {
      method: "OPTIONS",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "content-type,authorization",
    );

    // POST with body + authorization forwards upstream.
    const bidRes = await fetch(
      `http://127.0.0.1:${gatewayPort}/segments/${SEGMENT_ID}/generating`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-token",
        },
        body: JSON.stringify({}),
      },
    );
    expect(bidRes.status).toBe(200);
    expect(fakeApi.lifecycleCalls).toContain("/generating");
    expect(fakeApi.auth.last).toBe("Bearer test-token");
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Challenge-firing race — one fire-loop at a time, stop when playback ends
// ---------------------------------------------------------------------------

interface PlaybackLike {
  segmentId: string;
  startedAtMs: number;
  durationSec: number;
  held: PublicChallenge | null;
  timer?: NodeJS.Timeout;
  done: () => void;
}

function challengeFixture(id: string): PublicChallenge {
  return {
    id,
    type: "recall",
    question: `${id}?`,
    segmentId: "seg_race",
    validFrom: 0,
    validUntil: 60,
    difficulty: 1,
  };
}

describe("scheduler challenge firing guard", () => {
  it("runs one fire-loop at a time and stops once playback ends", async () => {
    const firedTypes: string[] = [];
    const gatewayStub = {
      emit: (event: { type: string }) => {
        firedTypes.push(event.type);
      },
    } as unknown as Gateway;

    // Every pull takes longer than the 200ms tick — exactly the case where
    // overlapping ticks used to spawn duplicate fire-loops.
    let pulls = 0;
    let releasePulls!: () => void;
    const gate = new Promise<void>((resolve) => {
      releasePulls = resolve;
    });
    const apiStub = {
      nextChallenge: async () => {
        pulls += 1;
        await gate;
        return challengeFixture(`ch_${pulls}`);
      },
    } as unknown as ApiClient;

    const env: OrchestratorEnv = {
      port: 0,
      apiBaseUrl: "http://unused.test",
      generatorBaseUrl: "http://unused.test",
      orchestratorApiToken: "test-orchestrator-token",
      generatorApiToken: "test-generator-token",
      segmentPlaySec: 60,
      auctionPollMs: 60_000,
      eventsPollMs: 60_000,
      genStageDelayMs: 5,
      generationTimeoutMs: 180_000,
      parallelApiKey: "",
      scraperPollMs: 60_000,
      scraperMaxResults: 10,
    };
    const scheduler = new SegmentScheduler({
      env,
      gateway: gatewayStub,
      api: apiStub,
    });
    const internals = scheduler as unknown as {
      playback: PlaybackLike | null;
      tickPlayback: (playback: PlaybackLike) => void;
    };

    const playback: PlaybackLike = {
      segmentId: "seg_race",
      startedAtMs: Date.now(),
      durationSec: 60,
      held: challengeFixture("ch_held"),
      done: () => {},
    };
    internals.playback = playback;

    // Two ticks back-to-back: without the guard this spawns two fire-loops
    // that both broadcast the held challenge.
    internals.tickPlayback(playback);
    internals.tickPlayback(playback);

    // The window closes while the first loop is still awaiting its fetch —
    // no further broadcasts may land after that.
    internals.playback = null;
    releasePulls();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(firedTypes.filter((t) => t === "challenge.fired")).toEqual([
      "challenge.fired",
    ]);
    expect(pulls).toBe(1);
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Failed-segment retry — a failed /failed cleanup must not skip the segment
// ---------------------------------------------------------------------------

describe("failed-segment retry", () => {
  it("retries the drive until POST /failed lands", async () => {
    const fakeApi = createFakeApi({ failFirstFailedCall: true });
    const fakeGenerator = createFakeGenerator();
    const apiBaseUrl = await listen(fakeApi.server);
    await listen(fakeGenerator.server);
    // Dead generator: generation fails, so the drive falls back to /failed.
    await close(fakeGenerator.server);

    const env: OrchestratorEnv = {
      port: 0,
      apiBaseUrl,
      generatorBaseUrl: "http://127.0.0.1:1",
      orchestratorApiToken: "test-orchestrator-token",
      generatorApiToken: "test-generator-token",
      segmentPlaySec: 1,
      auctionPollMs: 25,
      eventsPollMs: 60_000,
      genStageDelayMs: 5,
      generationTimeoutMs: 180_000,
      parallelApiKey: "",
      scraperPollMs: 60_000,
      scraperMaxResults: 10,
    };

    const gateway = new Gateway({ apiBaseUrl });
    const api = new ApiClient(
      apiBaseUrl,
      env.generatorBaseUrl,
      env.orchestratorApiToken,
      env.generatorApiToken,
    );
    const feed = new MarketplaceFeed(api, env.eventsPollMs, () => {});
    const scheduler = new SegmentScheduler({ env, gateway, api });
    feed.start();
    try {
      await scheduler.start();
      // First /failed 500s: the segment must stay unprocessed and the poll
      // loop must re-drive it until /failed succeeds.
      await waitFor(
        () =>
          fakeApi.lifecycleCalls.filter((path) => path === "/failed").length >=
          2,
        8000,
      );
      expect(
        fakeApi.lifecycleCalls.filter(
          (path) => path === "/generating" || path === "/failed",
        ),
      ).toEqual(["/generating", "/failed", "/generating", "/failed"]);
    } finally {
      scheduler.stop();
      feed.stop();
      await gateway.close();
      await close(fakeApi.server);
    }
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Encore queue — dead-air replays stay outside the clearing ledger
// ---------------------------------------------------------------------------

function segmentFixture(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    slot: Number(id.split("_")[1] ?? 0),
    brandId: `brand_${id}`,
    assetUrl: `https://cdn.test/${id}.mp4`,
    durationSeconds: 20,
    summary: `summary ${id}`,
    status: "done",
    ...overrides,
  };
}

function coldSnapshot(overrides: Partial<StreamSnapshot> = {}): StreamSnapshot {
  return {
    asOfSequence: 1,
    nowPlaying: null,
    recentSegments: [segmentFixture("seg_2"), segmentFixture("seg_1")],
    upcomingSegments: [],
    brands: [],
    leaderboard: [],
    nextSlotPriceUsd: 0,
    listeners: 0,
    attentionProofs: 0,
    listenerRewardsUsd: 0,
    ...overrides,
  };
}

function encoreEnv(segmentPlaySec: number): OrchestratorEnv {
  return {
    port: 0,
    apiBaseUrl: "http://unused.test",
    generatorBaseUrl: "http://unused.test",
    orchestratorApiToken: "test-orchestrator-token",
    generatorApiToken: "test-generator-token",
    segmentPlaySec,
    auctionPollMs: 60_000,
    eventsPollMs: 60_000,
    genStageDelayMs: 5,
    generationTimeoutMs: 180_000,
    parallelApiKey: "",
    scraperPollMs: 60_000,
    scraperMaxResults: 10,
  };
}

type WsEventLike = { type: string; [key: string]: unknown };

interface EncoreSchedulerInternals {
  playback: (PlaybackLike & { encore?: boolean }) | null;
  playbackSettled: Promise<void>;
  genDurationEwmaMs?: number;
  highSlotSeen: number;
  maybeStartEncore: () => Promise<void>;
  startPlayback: (
    segmentId: string,
    brandId: string,
    slot: number,
  ) => Promise<void>;
  prefetchUpcoming: () => Promise<void>;
}

describe("encore queue", () => {
  function makeScheduler(
    snapshot: StreamSnapshot,
    segmentPlaySec: number,
    calls: {
      markPlaying: string[];
      closeWindow: string[];
      nextChallenge: string[];
    },
  ) {
    const events: WsEventLike[] = [];
    const gatewayStub = {
      emit: (event: WsEventLike) => {
        events.push(event);
      },
    } as unknown as Gateway;
    const apiStub = {
      snapshot: async () => snapshot,
      markPlaying: async (segmentId: string) => {
        calls.markPlaying.push(segmentId);
        return {
          segmentId,
          startedAt: new Date().toISOString(),
          attentionThreshold: 3,
        };
      },
      closeWindow: async (segmentId: string) => {
        calls.closeWindow.push(segmentId);
        return true;
      },
      nextChallenge: async (segmentId: string) => {
        calls.nextChallenge.push(segmentId);
        return null;
      },
      auctionForSlot: async () => null,
    } as unknown as ApiClient;
    const scheduler = new SegmentScheduler({
      env: encoreEnv(segmentPlaySec),
      gateway: gatewayStub,
      api: apiStub,
    });
    return {
      scheduler,
      events,
      internals: scheduler as unknown as EncoreSchedulerInternals,
    };
  }

  it("fills dead air with a replay and bypasses the economic loop", async () => {
    const calls = { markPlaying: [], closeWindow: [], nextChallenge: [] } as {
      markPlaying: string[];
      closeWindow: string[];
      nextChallenge: string[];
    };
    const { scheduler, events, internals } = makeScheduler(
      coldSnapshot(),
      60,
      calls,
    );
    try {
      await internals.maybeStartEncore();
      expect(events.map((e) => e.type)).toEqual(["segment.encore"]);
      const encore = events[0];
      // Least-recently-encored + older-first: seg_1, not the newest seg_2.
      expect(encore.segmentId).toBe("seg_1");
      expect(encore.assetUrl).toBe("https://cdn.test/seg_1.mp4");
      expect(encore.brandId).toBe("brand_seg_1");
      expect(internals.playback?.encore).toBe(true);
      expect(calls.markPlaying).toEqual([]);
      expect(calls.closeWindow).toEqual([]);
      expect(calls.nextChallenge).toEqual([]);
    } finally {
      scheduler.stop();
    }
  });

  it("chains encores without repeating the immediately previous segment", async () => {
    const calls = { markPlaying: [], closeWindow: [], nextChallenge: [] } as {
      markPlaying: string[];
      closeWindow: string[];
      nextChallenge: string[];
    };
    const { scheduler, events, internals } = makeScheduler(
      coldSnapshot(),
      1,
      calls,
    );
    try {
      await internals.maybeStartEncore();
      await waitFor(
        () => events.filter((e) => e.type === "segment.encore").length >= 2,
        5000,
      );
      const ids = events
        .filter((e) => e.type === "segment.encore")
        .map((e) => e.segmentId);
      expect(ids[0]).not.toBe(ids[1]);
      // Economy stays untouched across the whole chain.
      expect(calls.markPlaying).toEqual([]);
      expect(calls.closeWindow).toEqual([]);
      expect(calls.nextChallenge).toEqual([]);
    } finally {
      scheduler.stop();
    }
  });

  it("stays quiet while the market is hot", async () => {
    const calls = { markPlaying: [], closeWindow: [], nextChallenge: [] } as {
      markPlaying: string[];
      closeWindow: string[];
      nextChallenge: string[];
    };
    const hot = coldSnapshot({
      leaderboard: [{ brandId: "brand_whale", amountUsd: 50 }],
    });
    const { scheduler, events, internals } = makeScheduler(hot, 60, calls);
    try {
      await internals.maybeStartEncore();
      expect(events).toEqual([]);
      expect(internals.playback).toBeNull();
    } finally {
      scheduler.stop();
    }
  });

  it("a live segment cuts the encore and opens exactly one window", async () => {
    const calls = { markPlaying: [], closeWindow: [], nextChallenge: [] } as {
      markPlaying: string[];
      closeWindow: string[];
      nextChallenge: string[];
    };
    const { scheduler, events, internals } = makeScheduler(
      coldSnapshot(),
      60,
      calls,
    );
    try {
      await internals.maybeStartEncore();
      expect(internals.playback?.encore).toBe(true);

      await internals.startPlayback("seg_live", "brand_live", 7);

      expect(calls.markPlaying).toEqual(["seg_live"]);
      expect(calls.closeWindow).toEqual([]);
      expect(internals.playback?.encore).toBeFalsy();
      expect(internals.playback?.segmentId).toBe("seg_live");
      expect(events.map((e) => e.type)).toEqual([
        "segment.encore",
        "segment.playing",
      ]);
    } finally {
      scheduler.stop();
    }
  });

  it("prefetch depth adapts to smoothed generation latency", async () => {
    const auctionSlots: number[] = [];
    const snapshot = coldSnapshot({
      upcomingSegments: [
        segmentFixture("seg_9", { status: "generating" }),
        segmentFixture("seg_8", { status: "generating" }),
      ],
    });
    const gatewayStub = { emit: () => {} } as unknown as Gateway;
    const apiStub = {
      snapshot: async () => snapshot,
      auctionForSlot: async (slot: number) => {
        auctionSlots.push(slot);
        return null;
      },
    } as unknown as ApiClient;
    const scheduler = new SegmentScheduler({
      env: encoreEnv(20),
      gateway: gatewayStub,
      api: apiStub,
    });
    const internals = scheduler as unknown as EncoreSchedulerInternals;
    try {
      // No latency data: depth 1 — two upcoming segments satisfy the gate.
      internals.highSlotSeen = 2;
      await internals.prefetchUpcoming();
      expect(auctionSlots).toEqual([]);

      // Slow generator (EWMA 45s vs 20s window): depth 3 — drive more work.
      internals.genDurationEwmaMs = 45_000;
      await internals.prefetchUpcoming();
      expect(auctionSlots).toEqual([1]);
    } finally {
      scheduler.stop();
    }
  });
});
