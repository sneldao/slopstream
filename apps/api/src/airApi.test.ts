import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express, { Router } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { registerAirRoutes } from "./airApi.js";
import { ClearingEngine } from "./clearing.js";
import { generateChallenges } from "./challenges.js";
import type { AttentionEventRow, SegmentRow } from "./ledger.js";
import { apiErrorHandler, createRouter } from "./routes.js";
import { setupHarness, type Harness } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

const TRANSCRIPT =
  "Aurora Robotics opened a plant in Denver this spring, backed by Nimbus Capital.";
const CLEARING_CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

function clearingFor(harness: Harness): ClearingEngine {
  return new ClearingEngine(
    harness.ledger,
    harness.bus,
    new StubProofVerifier(),
    CLEARING_CONFIG,
  );
}

function segmentFixture(id: string, openedAt: number): SegmentRow {
  return {
    id,
    slot: openedAt,
    brandId: "brand_acme",
    bidId: null,
    status: "playing",
    durationSec: 20,
    mediaUrl: `/assets/${id}.webp`,
    media: {
      version: 1,
      durationSec: 20,
      audio: {
        url: `https://cdn.test/${id}.mp3`,
        contentType: "audio/mpeg",
        sha256: "a".repeat(64),
      },
      visual: {
        url: `https://cdn.test/${id}.webp`,
        contentType: "image/webp",
        sha256: "b".repeat(64),
        type: "image",
      },
    },
    summary: `${id} summary — the narrator says ${TRANSCRIPT}`,
    brief: `${id} brief: read the transcript aloud`,
    thresholdFraction: 0.6,
    requiredEvents: 2,
    windowOpenedAtMs: openedAt,
    windowClosed: false,
    style: "documentary",
  };
}

function proofFixture(
  id: string,
  segmentId: string,
  sessionId: string,
): AttentionEventRow {
  return {
    id,
    listenerSessionId: sessionId,
    segmentId,
    challengeId: "chal_1",
    result: "valid",
    difficulty: 2,
    durationSec: 4,
    uniquenessScore: 1,
    proofRef: `nullifier_${id}`,
    createdAt: new Date(1_000).toISOString(),
    estimatedRewardCents: 333,
  };
}

async function startAirApp(
  harness: Harness,
  airApi?: Parameters<typeof createRouter>[0]["airApi"],
): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use(
    createRouter({
      ledger: harness.ledger,
      bus: harness.bus,
      auction: harness.auction,
      clearing: clearingFor(harness),
      market: harness.market,
      windowGraceSec: 0,
      orchestratorApiToken: "test-orchestrator-token",
      brandCreatorToken: "test-brand-creator-token",
      airApi,
    }),
  );
  app.use(apiErrorHandler);
  const server = await new Promise<Server>((resolve) => {
    const next = app.listen(0, () => resolve(next));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** A distinct client per call site keeps the fairness meter from coupling tests. */
function asClient(id: string): Record<string, string> {
  return { "X-Forwarded-For": `203.0.113.${id}` };
}

describe("broadcast read API — projection", () => {
  let app: Awaited<ReturnType<typeof startAirApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("keeps author-written prose and challenge answers in the process", async () => {
    const harness = setupHarness();
    const segment = segmentFixture("seg_live", 1_700_000_000_000);
    harness.ledger.segments.set(segment.id, segment);
    const challenges = generateChallenges(harness.ledger, {
      segmentId: segment.id,
      durationSec: segment.durationSec,
      transcript: TRANSCRIPT,
    });
    expect(challenges.length).toBeGreaterThan(0);
    harness.ledger.attentionEvents.set(
      "ev_1",
      proofFixture("ev_1", segment.id, "listener_1"),
    );

    app = await startAirApp(harness);
    const response = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("1"),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    const text = JSON.stringify(body);

    // The whitelist is the security boundary: none of this may appear,
    // not even inside a field that looks innocuous.
    expect(text).not.toContain(segment.summary);
    expect(text).not.toContain(segment.brief!);
    expect(text).not.toContain(TRANSCRIPT);
    expect(text).not.toContain("Aurora Robotics");
    // A true/false challenge answers with a JSON primitive, which also appears
    // in the payload as an unrelated boolean — only prose is scannable.
    const primitives = new Set(["true", "false", "null"]);
    const prose = challenges.filter((c) => !primitives.has(c.answer));
    expect(prose.length).toBeGreaterThan(0);
    for (const challenge of prose) {
      expect(text).not.toContain(challenge.answer);
      expect(text).not.toContain(challenge.question);
    }
    expect(text).not.toContain("listener_1");
    expect(text).not.toContain("nullifier_ev_1");
    expect(text).not.toContain("333");

    // And the machine-readable essentials do survive the projection.
    expect(body.nowPlaying).toMatchObject({
      segmentId: segment.id,
      slot: segment.slot,
      brandId: "brand_acme",
      status: "playing",
      durationSeconds: 20,
      style: "documentary",
      media: {
        audioUrl: "https://cdn.test/seg_live.mp3",
        visualUrl: "https://cdn.test/seg_live.webp",
        durationSec: 20,
      },
      attention: { validProofs: 1, requiredProofs: 2, thresholdMet: false },
      settlement: { settles: false },
    });
    expect(body.audience).toEqual({ listeners: 0, attentionProofs: 1 });
  });

  it("marks a cleared paid slot as settling, and an evergreen slot as not", async () => {
    const harness = setupHarness();
    const paid = segmentFixture("seg_paid", 1_700_000_000_000);
    harness.ledger.segments.set(paid.id, {
      ...paid,
      status: "done",
      bidId: "bid_1",
      windowClosed: true,
      clearedAmountCents: 4_500,
      clearedAtMs: 1_700_000_060_000,
    });
    const evergreen = segmentFixture("seg_evergreen", 1_700_000_100_000);
    harness.ledger.segments.set(evergreen.id, {
      ...evergreen,
      status: "done",
      bidId: null,
      windowClosed: true,
    });

    app = await startAirApp(harness);
    const response = await fetch(`${app.baseUrl}/air/history?limit=10`, {
      headers: asClient("2"),
    });
    const body = await response.json();
    const slots = new Map(
      (body.slots as Array<{ segmentId: string }>).map((s) => [s.segmentId, s]),
    );

    expect(slots.get("seg_paid")).toMatchObject({
      settlement: {
        settles: true,
        clearedAmountUsd: 45,
        clearedAt: new Date(1_700_000_060_000).toISOString(),
      },
    });
    expect(slots.get("seg_evergreen")).toMatchObject({
      settlement: { settles: false },
    });
  });

  it("omits the threshold question for a slot that never had a bar", async () => {
    const harness = setupHarness();
    const free = segmentFixture("seg_free", 1_700_000_000_000);
    delete free.requiredEvents;
    harness.ledger.segments.set(free.id, free);

    app = await startAirApp(harness);
    const response = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("3"),
    });
    const body = await response.json();
    expect(body.nowPlaying.attention).toEqual({ validProofs: 0 });
  });

  it("reads a receipt by public nullifier without naming a listener", async () => {
    const harness = setupHarness();
    const segment = segmentFixture("seg_paid", 1_700_000_000_000);
    harness.ledger.segments.set(segment.id, {
      ...segment,
      status: "done",
      bidId: "bid_1",
      windowClosed: true,
      clearedAmountCents: 4_500,
    });
    harness.ledger.attentionEvents.set(
      "ev_1",
      proofFixture("ev_1", segment.id, "listener_secret_session"),
    );
    harness.ledger.attentionEvents.set("ev_2", {
      ...proofFixture("ev_2", segment.id, "listener_other"),
      result: "invalid",
    });

    app = await startAirApp(harness);
    const response = await fetch(`${app.baseUrl}/air/receipt/${segment.id}`, {
      headers: asClient("4"),
    });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.windowClosed).toBe(true);
    expect(body.proofIds).toEqual(["nullifier_ev_1"]);
    expect(body.totals).toEqual({ validProofs: 1, challenges: 0 });
    const text = JSON.stringify(body);
    expect(text).not.toContain("listener_secret_session");
    expect(text).not.toContain("listener_other");
    expect(text).not.toContain("333");
    expect(text).not.toContain(segment.summary);

    const missing = await fetch(`${app.baseUrl}/air/receipt/nope`, {
      headers: asClient("4"),
    });
    expect(missing.status).toBe(404);
  });

  it("validates history input", async () => {
    app = await startAirApp(setupHarness());
    for (const query of [
      "limit=0",
      "limit=101",
      "limit=many",
      "since=yesterday",
    ]) {
      const response = await fetch(`${app.baseUrl}/air/history?${query}`, {
        headers: asClient("5"),
      });
      expect(response.status, query).toBe(400);
    }
  });

  it("answers 404 like an unmounted route when disabled", async () => {
    app = await startAirApp(setupHarness(), { enabled: false });
    for (const path of ["/air/now", "/air/history", "/air/receipt/seg_x"]) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        headers: asClient("6"),
      });
      expect(response.status, path).toBe(404);
      expect(await response.json()).toEqual({
        error: "the broadcast api is not enabled",
      });
    }
  });
});

describe("broadcast read API — free-tier meter", () => {
  const DAY = 1_700_000_000_000;

  async function start(
    harness: Harness,
    opts: { now: () => number; callsPerWindow: number; windowMs: number },
  ): Promise<{ baseUrl: string; close(): Promise<void> }> {
    const app = express();
    const router = Router();
    registerAirRoutes(router, {
      ledger: harness.ledger,
      bus: harness.bus,
      clearing: clearingFor(harness),
      config: {
        callsPerWindow: opts.callsPerWindow,
        windowMs: opts.windowMs,
      },
      now: opts.now,
    });
    app.use(router);
    app.use(apiErrorHandler);
    const server = await new Promise<Server>((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });
    const { port } = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    };
  }

  it("counts down, refuses past the limit, and recovers when the window rolls", async () => {
    const harness = setupHarness();
    harness.ledger.segments.set("seg_live", segmentFixture("seg_live", DAY));
    let clock = DAY;
    const app = await start(harness, {
      now: () => clock,
      callsPerWindow: 2,
      windowMs: 60_000,
    });

    const first = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("10"),
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-air-tier")).toBe("free");
    expect(first.headers.get("x-air-remaining")).toBe("1");

    const second = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("10"),
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("x-air-remaining")).toBe("0");

    const third = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("10"),
    });
    expect(third.status).toBe(429);
    // No PAYMENT-REQUIRED / x402 body until a settlement rail exists.
    expect(await third.json()).toMatchObject({
      metering: { tier: "free", retryAfterMs: 60_000 },
    });

    // A different client is unaffected, and the window rolls for everyone.
    const other = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("11"),
    });
    expect(other.status).toBe(200);

    clock = DAY + 60_000;
    const rolled = await fetch(`${app.baseUrl}/air/now`, {
      headers: asClient("10"),
    });
    expect(rolled.status).toBe(200);
    expect(rolled.headers.get("x-air-remaining")).toBe("1");

    await app.close();
  });

  it("tells an over-quota client how much of the window is left", async () => {
    const harness = setupHarness();
    let clock = DAY;
    const app = await start(harness, {
      now: () => clock,
      callsPerWindow: 1,
      windowMs: 10_000,
    });

    expect(
      (await fetch(`${app.baseUrl}/air/history`, { headers: asClient("12") }))
        .status,
    ).toBe(200);

    clock = DAY + 7_500;
    const blocked = await fetch(`${app.baseUrl}/air/history`, {
      headers: asClient("12"),
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("3");
    expect(
      ((await blocked.json()) as { metering: { retryAfterMs: number } })
        .metering.retryAfterMs,
    ).toBe(2_500);

    // The meter holds no ledger state and publishes nothing.
    expect(harness.ledger.segments.size).toBe(0);
    expect(harness.events.length).toBe(0);
    await app.close();
  });
});
