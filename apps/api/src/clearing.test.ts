import type { AttentionProofSubmission } from "@slopstream/shared";
import { describe, expect, it } from "vitest";
import { generateChallenges } from "./challenges.js";
import { ClearingEngine } from "./clearing.js";
import type { Harness } from "./test-harness.js";
import { fundedBrand, setupHarness } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

const CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

/** Run one auction to a won segment with challenges seeded from a transcript. */
function wonSegment(h: Harness, bidUsd: number) {
  const brand = fundedBrand(h, "A", 100);
  h.auction.placeBid(brand, bidUsd);
  const winner = h.auction.closeAuction(1);
  const segment = h.ledger.segments.get(winner!.segmentId!)!;
  generateChallenges(h.ledger, {
    segmentId: segment.id,
    durationSec: 30,
    transcript: "Zephyr Quantum delivers blazing fast Pipelines",
  });
  return { brand, segment, winner: winner! };
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

describe("attention window and clearing", () => {
  it("freezes required_events at window open and clears on threshold", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { brand, segment } = wonSegment(h, 25);

    const s1 = h.market.createListenerSession().session;
    const s2 = h.market.createListenerSession().session;
    clearing.openWindow(segment.id, 2_000_000_000);
    expect(segment.requiredEvents).toBe(2); // ceil(0.6 × 2)

    // Late joiners do not move the goalposts.
    h.market.createListenerSession();
    expect(segment.requiredEvents).toBe(2);

    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const at = challenge.validFrom + 1;
    const r1 = await clearing.submitProof(
      s1,
      proofFor(s1.token, segment.id, challenge.id, "Zephyr", at),
    );
    expect(r1.verified).toBe(true);
    expect(r1.estimatedRewardUsd).toBe(20); // alone: whole $20 listener pool
    const r2 = await clearing.submitProof(
      s2,
      proofFor(s2.token, segment.id, challenge.id, "Zephyr", at + 1),
    );
    expect(r2.verified).toBe(true);
    expect(r2.estimatedRewardUsd).toBe(10); // equal difficulty splits the pool

    const verified = h.events.filter((e) => e.type === "attention.verified");
    expect(verified).toHaveLength(2);
    expect(verified[1]).toMatchObject({ verifiedCount: 2, threshold: 2 });

    const result = clearing.closeWindow(segment.id);
    expect(result.cleared).toBe(true);

    // First-price: the full bid settles as spend.
    expect(h.ledger.balances.get(brand.id)).toMatchObject({
      reservedCents: 0,
      spentCents: 2500,
    });
    expect(h.ledger.bids.get(segment.bidId!)?.status).toBe("cleared");

    // 80/20 split: $20 listener pool, $5 platform.
    const pool = h.ledger.rewardPools.get(result.poolId!)!;
    expect(pool.eligibleCents).toBe(2000);
    expect(pool.distributedCents).toBe(2000);
    expect(s1.balanceCents + s2.balanceCents).toBe(2000);
    const cleared = h.events.find((e) => e.type === "bid.cleared");
    expect(cleared).toMatchObject({
      grossAmountUsd: 25,
      listenerPoolUsd: 20,
      platformRevenueUsd: 5,
    });

    // Clearing evaluates exactly once.
    expect(() => clearing.closeWindow(segment.id)).toThrow();
  });

  it("records invalid answers without clearing", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { brand, segment } = wonSegment(h, 25);
    const s1 = h.market.createListenerSession().session;
    clearing.openWindow(segment.id, 2_000_000_000);
    const challenge = h.ledger.challengesForSegment(segment.id)[0];
    const receipt = await clearing.submitProof(
      s1,
      proofFor(
        s1.token,
        segment.id,
        challenge.id,
        "definitely wrong",
        challenge.validFrom + 1,
      ),
    );
    expect(receipt.verified).toBe(false);
    expect(
      h.events.filter((e) => e.type === "attention.verified"),
    ).toHaveLength(0);

    const result = clearing.closeWindow(segment.id);
    expect(result.cleared).toBe(false);
    expect(h.ledger.bids.get(segment.bidId!)?.status).toBe("uncleared");
    // Reservation returned in full.
    expect(h.ledger.balances.get(brand.id)).toMatchObject({
      availableCents: 10000,
      reservedCents: 0,
      spentCents: 0,
    });
    expect(h.events.some((e) => e.type === "bid.uncleared")).toBe(true);
    expect(h.ledger.rewardPools.size).toBe(0);
  });

  it("rejects replayed answers from the same session", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { segment } = wonSegment(h, 25);
    const s1 = h.market.createListenerSession().session;
    clearing.openWindow(segment.id, 2_000_000_000);
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const sub = proofFor(
      s1.token,
      segment.id,
      challenge.id,
      "Zephyr",
      challenge.validFrom + 1,
    );
    await clearing.submitProof(s1, sub);
    await expect(clearing.submitProof(s1, sub)).rejects.toThrow(
      /already answered/,
    );
  });

  it("rejects answers outside the validity window", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { segment } = wonSegment(h, 25);
    const s1 = h.market.createListenerSession().session;
    clearing.openWindow(segment.id, 2_000_000_000);
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const receipt = await clearing.submitProof(
      s1,
      proofFor(
        s1.token,
        segment.id,
        challenge.id,
        "Zephyr",
        challenge.validUntil + 5,
      ),
    );
    expect(receipt.verified).toBe(false);
  });

  it("returns the reservation when generation fails", () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const { brand, segment } = wonSegment(h, 10);
    clearing.failSegment(segment.id);
    expect(h.ledger.segments.get(segment.id)?.status).toBe("failed");
    expect(h.ledger.bids.get(segment.bidId!)?.status).toBe("failed");
    expect(h.ledger.balances.get(brand.id)).toMatchObject({
      availableCents: 10000,
      reservedCents: 0,
      spentCents: 0,
    });
    expect(h.events.some((e) => e.type === "bid.failed")).toBe(true);
    expect(h.events.some((e) => e.type === "bid.uncleared")).toBe(false);
  });
});
