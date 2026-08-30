import type { AttentionProofSubmission } from "@slopstream/shared";
import { describe, expect, it } from "vitest";
import { generateChallenges } from "./challenges.js";
import { ClearingEngine } from "./clearing.js";
import { toListenerSession } from "./market.js";
import { setupHarness, fundedBrand } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

const CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

function wonSegment(h: ReturnType<typeof setupHarness>, bidUsd: number) {
  const brand = fundedBrand(h, "A", 100);
  h.auction.placeBid(brand, bidUsd);
  const winner = h.auction.closeAuction(1);
  const segment = h.ledger.segments.get(winner!.segmentId!)!;
  const challenges = generateChallenges(h.ledger, {
    segmentId: segment.id,
    durationSec: 30,
    transcript: "Zephyr Quantum delivers blazing fast Pipelines",
  });
  for (const challenge of challenges) challenge.firedAtMs = Date.now();
  return { brand, segment };
}

function proofFor(
  sessionToken: string,
  segmentId: string,
  challengeId: string,
  answer: string,
  atSec: number,
): AttentionProofSubmission {
  return {
    listenerCommitment: sessionToken,
    segmentId,
    challengeId,
    resultProof: JSON.stringify({ answer, answeredAtSec: atSec }),
  };
}

describe("listener session balances", () => {
  it("tracks pending until a segment clears, then credits available", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { segment } = wonSegment(h, 25);
    const listener = h.market.createListenerSession().session;
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const at = challenge.validFrom + 1;
    clearing.openWindow(segment.id, Date.now() - at * 1_000);

    await clearing.submitProof(
      listener,
      proofFor(listener.token, segment.id, challenge.id, "Zephyr", at),
    );

    const pending = toListenerSession(listener, h.ledger);
    expect(pending.pendingBalanceUsd).toBe(20);
    expect(pending.availableBalanceUsd).toBe(0);

    clearing.closeWindow(segment.id);

    const cleared = toListenerSession(listener, h.ledger);
    expect(cleared.pendingBalanceUsd).toBe(0);
    expect(cleared.availableBalanceUsd).toBe(20);
  });

  it("requestPayout debits available balance and records a receipt", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { segment } = wonSegment(h, 25);
    const listener = h.market.createListenerSession().session;
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const at = challenge.validFrom + 1;
    clearing.openWindow(segment.id, Date.now() - at * 1_000);
    await clearing.submitProof(
      listener,
      proofFor(listener.token, segment.id, challenge.id, "Zephyr", at),
    );
    clearing.closeWindow(segment.id);

    const receipt = h.market.requestPayout(listener);
    expect(receipt.amountUsd).toBe(20);
    expect(receipt.status).toBe("completed");
    expect(toListenerSession(listener, h.ledger).availableBalanceUsd).toBe(0);
    expect(h.ledger.listenerPayouts.size).toBe(1);
  });
});
