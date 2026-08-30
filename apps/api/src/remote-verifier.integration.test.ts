import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createVerifierServer } from "@slopstream/verifier/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuctionEngine } from "./auction.js";
import { MarketplaceBus } from "./bus.js";
import { generateChallenges } from "./challenges.js";
import { ClearingEngine } from "./clearing.js";
import { Ledger } from "./ledger.js";
import { MarketService } from "./market.js";
import { apiErrorHandler, createRouter } from "./routes.js";
import { RemoteProofVerifier } from "./verifier.js";

const VERIFIER_TOKEN = "integration-verifier-token";
const CLEARING_CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("remote verifier integration", () => {
  let apiServer: Server;
  let verifierServer: Server;
  let apiBaseUrl: string;
  let ledger: Ledger;
  let bus: MarketplaceBus;
  let market: MarketService;
  let clearing: ClearingEngine;
  let segmentId: string;
  let listenerToken: string;
  let listenerCommitment: string;
  let challengeId: string;
  let challengeAnswer: string;
  let answeredAtSec: number;

  beforeEach(async () => {
    verifierServer = createVerifierServer({ apiToken: VERIFIER_TOKEN });
    const verifierBaseUrl = await listen(verifierServer);

    ledger = new Ledger();
    bus = new MarketplaceBus();
    market = new MarketService(ledger);
    const noopTimer = { unref() {} } as unknown as NodeJS.Timeout;
    const auction = new AuctionEngine(ledger, bus, {
      auctionDurationSec: 60,
      thresholdFraction: 0.6,
      setTimeout: () => noopTimer,
    });
    clearing = new ClearingEngine(
      ledger,
      bus,
      new RemoteProofVerifier(
        `${verifierBaseUrl}/v1/attention-proofs/verify`,
        VERIFIER_TOKEN,
      ),
      CLEARING_CONFIG,
    );

    const { brand } = market.createBrand({
      name: "Integration Brand",
      primaryColor: "#000000",
      secondaryColor: "#ffffff",
      brief: "A brand brief for an end-to-end remote verifier test.",
    });
    market.topUp({ brandId: brand.id, amountUsd: 100 });
    auction.placeBid(brand, 10);
    const winner = auction.closeAuction(1)!;
    const segment = ledger.segments.get(winner.segmentId!)!;
    segmentId = segment.id;
    generateChallenges(ledger, {
      segmentId,
      durationSec: 30,
      transcript: "Zephyr Quantum delivers blazing fast Pipelines",
    });
    const challenge = ledger
      .challengesForSegment(segmentId)
      .find((item) => item.answer === "Zephyr")!;
    challengeId = challenge.id;
    challengeAnswer = challenge.answer;
    answeredAtSec = challenge.validFrom + 1;
    challenge.firedAtMs = Date.now();
    clearing.openWindow(segmentId, Date.now() - answeredAtSec * 1_000);

    const { session } = market.createListenerSession();
    listenerToken = session.token;
    listenerCommitment = session.commitment;

    const app = express();
    app.use(express.json());
    app.use(
      createRouter({
        ledger,
        bus,
        auction,
        clearing,
        market,
        windowGraceSec: 0,
        orchestratorApiToken: "test-orchestrator-token",
      }),
    );
    app.use(apiErrorHandler);
    apiServer = app.listen(0);
    apiBaseUrl = await new Promise<string>((resolve) => {
      apiServer.once("listening", () => {
        const { port } = apiServer.address() as AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  });

  afterEach(async () => {
    await Promise.all([close(apiServer), close(verifierServer)]);
  });

  it("persists a remote-verifier receipt for a correct private answer", async () => {
    const response = await fetch(`${apiBaseUrl}/attention-proofs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${listenerToken}`,
      },
      body: JSON.stringify({
        listenerCommitment,
        segmentId,
        challengeId,
        resultProof: JSON.stringify({
          answer: challengeAnswer,
          answeredAtSec,
        }),
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      verifierMode: "stub",
      proofId: expect.stringMatching(/^stub_[a-f0-9]{64}$/),
    });
    expect(ledger.attentionEvents).toHaveLength(1);
    expect(Array.from(ledger.attentionEvents.values())[0]).toMatchObject({
      result: "valid",
    });
    expect(bus.since(0).map((delivery) => delivery.event.type)).toContain(
      "attention.verified",
    );
  });

  it("keeps an incorrect answer private and does not call the verifier", async () => {
    const response = await fetch(`${apiBaseUrl}/attention-proofs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${listenerToken}`,
      },
      body: JSON.stringify({
        listenerCommitment,
        segmentId,
        challengeId,
        resultProof: JSON.stringify({
          answer: "wrong answer",
          answeredAtSec,
        }),
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      verified: false,
      verifierMode: "stub",
    });
    expect(ledger.attentionEvents).toHaveLength(1);
    expect(Array.from(ledger.attentionEvents.values())[0]).toMatchObject({
      result: "invalid",
    });
    expect(bus.since(0).map((delivery) => delivery.event.type)).not.toContain(
      "attention.verified",
    );
  });
});
