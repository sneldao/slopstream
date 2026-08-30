import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClearingEngine } from "./clearing.js";
import { apiErrorHandler, createRouter } from "./routes.js";
import { fundedBrand, setupHarness, type Harness } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

const CLEARING_CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

interface ListenerSessionResponse {
  token: string;
  session: { id: string };
}

interface ErrorResponse {
  error: string;
}

describe("HTTP authorization boundaries", () => {
  let harness: Harness;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    harness = setupHarness();
    const clearing = new ClearingEngine(
      harness.ledger,
      harness.bus,
      new StubProofVerifier(),
      CLEARING_CONFIG,
    );
    const app = express();
    app.use(express.json());
    app.use(
      createRouter({
        ledger: harness.ledger,
        bus: harness.bus,
        auction: harness.auction,
        clearing,
        market: harness.market,
        windowGraceSec: 0,
      }),
    );
    app.use(apiErrorHandler);
    server = await new Promise<Server>((resolve) => {
      const next = app.listen(0, () => resolve(next));
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("does not accept a body brandId as authorization", async () => {
    const brand = fundedBrand(harness, "Acme", 100);
    const response = await fetch(`${baseUrl}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, amountUsd: 10 }),
    });

    expect(response.status).toBe(401);
    expect((await response.json()) as ErrorResponse).toEqual({
      error: "missing bearer token",
    });
    expect(harness.ledger.bids.size).toBe(0);
  });

  it("requires an authenticated brand to act only for itself", async () => {
    const acme = fundedBrand(harness, "Acme", 100);
    const rival = fundedBrand(harness, "Rival", 100);
    const response = await fetch(`${baseUrl}/top-ups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${acme.token}`,
      },
      body: JSON.stringify({ brandId: rival.id, amountUsd: 10 }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()) as ErrorResponse).toEqual({
      error: "top-up brandId must match the bearer brand",
    });
  });

  it("issues a listener bearer token and binds its commitment on resume", async () => {
    const created = await fetch(`${baseUrl}/listener-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listenerCommitment: "listener:one" }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as ListenerSessionResponse;

    const unauthenticated = await fetch(`${baseUrl}/listener-sessions/me`);
    expect(unauthenticated.status).toBe(401);

    const mismatch = await fetch(`${baseUrl}/listener-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.token}`,
      },
      body: JSON.stringify({ listenerCommitment: "listener:other" }),
    });
    expect(mismatch.status).toBe(403);
    expect((await mismatch.json()) as ErrorResponse).toEqual({
      error: "listener commitment does not match this session",
    });
  });

  it("requires a listener bearer token before accepting a proof payload", async () => {
    const response = await fetch(`${baseUrl}/attention-proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listenerCommitment: "listener:any",
        segmentId: "seg_any",
        challengeId: "ch_any",
        resultProof: "{}",
      }),
    });

    expect(response.status).toBe(401);
    expect((await response.json()) as ErrorResponse).toEqual({
      error: "missing bearer token",
    });
  });
});
