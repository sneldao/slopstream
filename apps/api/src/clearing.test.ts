import type { AttentionProofSubmission } from "@slopstream/shared";
import { describe, expect, it } from "vitest";
import { generateChallenges } from "./challenges.js";
import { ClearingEngine } from "./clearing.js";
import type { Harness } from "./test-harness.js";
import { fundedBrand, setupHarness } from "./test-harness.js";
import { StubProofVerifier } from "./verifier.js";

const CONFIG = { listenerPct: 0.8, platformPct: 0.2 };

function openDuring(
  clearing: ClearingEngine,
  segmentId: string,
  atSec: number,
): void {
  clearing.openWindow(segmentId, Date.now() - atSec * 1_000);
}

/** Run one auction to a won segment with challenges seeded from a transcript. */
function wonSegment(h: Harness, bidUsd: number, slot = 1) {
  const brand = fundedBrand(h, `A${slot}`, 100);
  h.auction.placeBid(brand, bidUsd);
  const winner = h.auction.closeAuction(slot);
  const segment = h.ledger.segments.get(winner!.segmentId!)!;
  const challenges = generateChallenges(h.ledger, {
    segmentId: segment.id,
    durationSec: 30,
    transcript: "Zephyr Quantum delivers blazing fast Pipelines",
  });
  for (const challenge of challenges) challenge.firedAtMs = Date.now();
  return { brand, segment, winner: winner! };
}

/** Playback time inside every challenge window for a 30s/4-challenge segment. */
const ALL_WINDOWS_AT_SEC = 17;

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
  it("freezes the threshold from recently active listeners only", () => {
    const h = setupHarness({ thresholdFraction: 0.75 });
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      { ...CONFIG, activeListenerWindowMs: 60_000 },
    );
    const { segment } = wonSegment(h, 10);
    const now = 2_000_000_000;
    const activeA = h.market.createListenerSession().session;
    const activeB = h.market.createListenerSession().session;
    const stale = h.market.createListenerSession().session;
    activeA.lastSeenAtMs = now;
    activeB.lastSeenAtMs = now - 30_000;
    stale.lastSeenAtMs = now - 60_001;

    clearing.openWindow(segment.id, now);

    expect(segment.requiredEvents).toBe(2);
    expect(clearing.activeListenerCount(now)).toBe(2);
  });

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
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    const at = challenge.validFrom + 1;
    openDuring(clearing, segment.id, at);
    expect(segment.requiredEvents).toBe(2); // ceil(0.6 × 2)

    // Late joiners do not move the goalposts.
    h.market.createListenerSession();
    expect(segment.requiredEvents).toBe(2);

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

    const clearedAtMs = 2_000_000_000;
    const result = clearing.closeWindow(segment.id, clearedAtMs);
    expect(result.cleared).toBe(true);
    expect(segment.clearedAtMs).toBe(clearedAtMs);

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

    // Clearing is retry-safe and evaluates exactly once.
    expect(clearing.closeWindow(segment.id)).toEqual({
      cleared: true,
      poolId: result.poolId,
    });
    expect(h.ledger.rewardPools).toHaveLength(1);
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
    const challenge = h.ledger.challengesForSegment(segment.id)[0];
    openDuring(clearing, segment.id, challenge.validFrom + 1);
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
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    openDuring(clearing, segment.id, challenge.validFrom + 1);
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
    const challenge = h.ledger
      .challengesForSegment(segment.id)
      .find((c) => c.answer === "Zephyr")!;
    openDuring(clearing, segment.id, challenge.validUntil + 5);
    const receipt = await clearing.submitProof(
      s1,
      proofFor(
        s1.token,
        segment.id,
        challenge.id,
        "Zephyr",
        challenge.validFrom + 1,
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

    // A retried failure notification is a no-op, not a second refund.
    clearing.failSegment(segment.id);
    expect(h.ledger.balances.get(brand.id)).toMatchObject({
      availableCents: 10000,
      reservedCents: 0,
      spentCents: 0,
    });
    expect(h.events.filter((e) => e.type === "bid.failed")).toHaveLength(1);
  });

  it("locks a session that keeps guessing wrong answers", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const s1 = h.market.createListenerSession().session;

    const guess = async (slot: number, count: number) => {
      const { segment } = wonSegment(h, 25, slot);
      openDuring(clearing, segment.id, ALL_WINDOWS_AT_SEC);
      for (const challenge of h.ledger
        .challengesForSegment(segment.id)
        .slice(0, count)) {
        await clearing.submitProof(
          s1,
          proofFor(
            s1.token,
            segment.id,
            challenge.id,
            "definitely wrong",
            ALL_WINDOWS_AT_SEC,
          ),
        );
      }
    };

    await guess(1, 4); // invalid = 4
    await guess(2, 2); // invalid = 6 (the 6th still passes: 5 <= 0 + slack)
    expect(s1.invalidProofs).toBe(6);

    const { segment } = wonSegment(h, 25, 3);
    openDuring(clearing, segment.id, ALL_WINDOWS_AT_SEC);
    const next = h.ledger.challengesForSegment(segment.id)[0];
    await expect(
      clearing.submitProof(
        s1,
        proofFor(
          s1.token,
          segment.id,
          next.id,
          "definitely wrong",
          ALL_WINDOWS_AT_SEC,
        ),
      ),
    ).rejects.toThrow(/too many incorrect answers/);
    // The rejected submission records nothing.
    expect(s1.invalidProofs).toBe(6);
  });

  it("keeps an imperfect session unlocked while it still answers correctly", async () => {
    const h = setupHarness();
    const clearing = new ClearingEngine(
      h.ledger,
      h.bus,
      new StubProofVerifier(),
      CONFIG,
    );
    const s1 = h.market.createListenerSession().session;

    const submit = async (
      segmentId: string,
      challengeId: string,
      answer: string,
    ) =>
      clearing.submitProof(
        s1,
        proofFor(s1.token, segmentId, challengeId, answer, ALL_WINDOWS_AT_SEC),
      );

    const seg1 = wonSegment(h, 25, 1);
    openDuring(clearing, seg1.segment.id, ALL_WINDOWS_AT_SEC);
    for (const c of h.ledger.challengesForSegment(seg1.segment.id)) {
      await submit(seg1.segment.id, c.id, "definitely wrong"); // invalid = 4
    }

    const seg2 = wonSegment(h, 25, 2);
    openDuring(clearing, seg2.segment.id, ALL_WINDOWS_AT_SEC);
    const [c0, c1, c2, c3] = h.ledger.challengesForSegment(seg2.segment.id);
    await submit(seg2.segment.id, c0.id, "definitely wrong"); // invalid = 5
    const recall = await submit(seg2.segment.id, c1.id, c1.answer);
    expect(recall.verified).toBe(true); // valid = 1 restores slack
    // Submissions 7 and 8 only pass because the correct answer moved the bar.
    await submit(seg2.segment.id, c2.id, "definitely wrong"); // invalid = 6
    await submit(seg2.segment.id, c3.id, "definitely wrong"); // invalid = 7
    expect(s1.invalidProofs).toBe(7);
    expect(s1.validProofs).toBe(1);

    const seg3 = wonSegment(h, 25, 3);
    openDuring(clearing, seg3.segment.id, ALL_WINDOWS_AT_SEC);
    const next = h.ledger.challengesForSegment(seg3.segment.id)[0];
    await expect(
      submit(seg3.segment.id, next.id, "definitely wrong"),
    ).rejects.toThrow(/too many incorrect answers/);
  });
});
