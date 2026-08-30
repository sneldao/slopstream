// Clearing and rewards (Lane 2 owns all clearing and settlement —
// docs/technical/architecture.md). Implements bid-clearing semantics and the
// reward pool (docs/product/economics.md): the bid clears in full once the
// segment's attention threshold is met, then the listener share is distributed
// proportionally across valid attention events.

import type {
  AttentionProofReceipt,
  AttentionProofSubmission,
} from "@slopstream/shared";
import type { EventBus } from "./bus.js";
import { isoNow, newId } from "./ids.js";
import type {
  AttentionEventRow,
  BidRow,
  Ledger,
  ListenerSessionRow,
  RewardPoolRow,
  SegmentRow,
} from "./ledger.js";
import { assert, centsToUsd, splitCents, usdToCents } from "./money.js";
import type { ProofVerifier } from "./verifier.js";

/**
 * Distribute `totalCents` across weighted shares so the amounts are integer
 * cents that sum EXACTLY to totalCents (largest-remainder / Hamilton method).
 * Returns cents per key, in input order.
 */
export function distributeCents(
  totalCents: number,
  weights: Array<{ key: string; weight: number }>,
): Map<string, number> {
  const result = new Map<string, number>();
  const positive = weights.filter((w) => w.weight > 0);
  if (totalCents <= 0 || positive.length === 0) {
    for (const w of weights) result.set(w.key, 0);
    return result;
  }
  const totalWeight = positive.reduce((sum, w) => sum + w.weight, 0);
  let allocated = 0;
  const fractions: Array<{ key: string; frac: number }> = [];
  for (const { key, weight } of weights) {
    if (weight <= 0) {
      result.set(key, 0);
      continue;
    }
    const raw = (totalCents * weight) / totalWeight;
    const whole = Math.floor(raw);
    result.set(key, whole);
    allocated += whole;
    fractions.push({ key, frac: raw - whole });
  }
  // Hand out the leftover cents to the largest fractional remainders.
  fractions.sort((a, b) => b.frac - a.frac);
  let leftover = totalCents - allocated;
  for (let i = 0; i < fractions.length && leftover > 0; i++, leftover--) {
    const { key } = fractions[i];
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export interface ClearingConfig {
  listenerPct: number;
  platformPct: number;
}

export class ClearingEngine {
  constructor(
    private readonly ledger: Ledger,
    private readonly bus: EventBus,
    private readonly verifier: ProofVerifier,
    private readonly config: ClearingConfig,
  ) {}

  /** Freeze the attention threshold when playback opens the window. */
  openWindow(segmentId: string, nowMs: number): SegmentRow {
    const segment = this.ledger.segments.get(segmentId);
    assert(segment, 404, `unknown segment ${segmentId}`);
    segment.status = "playing";
    segment.windowOpenedAtMs = nowMs;
    if (segment.requiredEvents === undefined) {
      const listenerCount = Math.max(this.ledger.listeners.size, 1);
      segment.requiredEvents = Math.max(
        1,
        Math.ceil(segment.thresholdFraction * listenerCount),
      );
    }
    return segment;
  }

  /**
   * Lane 2 persists the submission, hands it to the verifier (Lane 1 boundary),
   * records the attention event, and — if valid — publishes attention.verified.
   */
  async submitProof(
    session: ListenerSessionRow,
    submission: AttentionProofSubmission,
  ): Promise<AttentionProofReceipt> {
    const challenge = this.ledger.challenges.get(submission.challengeId);
    assert(challenge, 404, `unknown challenge ${submission.challengeId}`);
    assert(
      challenge.segmentId === submission.segmentId,
      400,
      "challenge is not bound to the submitted segment",
    );
    const segment = this.ledger.segments.get(submission.segmentId);
    assert(segment, 404, `unknown segment ${submission.segmentId}`);

    // Non-replayable: one event per listener per challenge.
    const already = [...this.ledger.attentionEvents.values()].find(
      (e) =>
        e.listenerSessionId === session.id && e.challengeId === challenge.id,
    );
    assert(!already, 409, "challenge already answered by this session");

    const outcome = await this.verifier.verify(submission, challenge);
    const event: AttentionEventRow = {
      id: newId("evt"),
      listenerSessionId: session.id,
      segmentId: segment.id,
      challengeId: challenge.id,
      result: outcome.verified ? "valid" : "invalid",
      difficulty: challenge.difficulty,
      durationSec:
        outcome.answeredAtSec !== undefined
          ? Math.max(outcome.answeredAtSec - challenge.validFrom, 0)
          : 0,
      uniquenessScore: 1,
      proofRef: outcome.proofId ?? "stub",
      createdAt: isoNow(),
    };
    this.ledger.attentionEvents.set(event.id, event);

    if (outcome.verified) {
      const validCount = this.ledger.validEventsForSegment(segment.id).length;
      this.bus.publish({
        type: "attention.verified",
        segmentId: segment.id,
        verifiedCount: validCount,
        total: Math.max(this.ledger.listeners.size, 1),
        threshold: segment.requiredEvents ?? 0,
      });
    }

    const brand = segment.brandId
      ? this.ledger.brands.get(segment.brandId)
      : undefined;
    return {
      proofId: outcome.proofId ?? newId("proof"),
      segmentId: segment.id,
      challengeId: challenge.id,
      brandId: brand?.id ?? "",
      challengeType: challenge.type,
      verified: outcome.verified,
      estimatedRewardUsd: outcome.verified
        ? this.estimateShare(segment, event)
        : undefined,
      createdAt: event.createdAt,
    };
  }

  /** A pending-close share estimate: what this event would earn if the pool settled now. */
  private estimateShare(segment: SegmentRow, event: AttentionEventRow): number {
    const bid = segment.bidId ? this.ledger.bids.get(segment.bidId) : undefined;
    if (!bid) return 0;
    const eligible = splitCents(bid.amountCents, this.config.listenerPct);
    const events = this.ledger.validEventsForSegment(segment.id);
    const weights = events.map((e) => ({
      key: e.id,
      weight: e.difficulty * e.uniquenessScore,
    }));
    const shares = distributeCents(eligible, weights);
    return centsToUsd(shares.get(event.id) ?? 0);
  }

  /**
   * Evaluate the window at close: cleared (threshold met, full bid settles and
   * a pool is created + distributed) or uncleared (reservation returned).
   * Emits bid.cleared + reward.pool.updated, or bid.uncleared.
   */
  closeWindow(segmentId: string): { cleared: boolean; poolId?: string } {
    const segment = this.ledger.segments.get(segmentId);
    assert(segment, 404, `unknown segment ${segmentId}`);
    assert(!segment.windowClosed, 409, "window already closed");
    segment.windowClosed = true;
    segment.status = "done";

    const validCount = this.ledger.validEventsForSegment(segment.id).length;
    const required = segment.requiredEvents ?? 0;
    const bid = segment.bidId ? this.ledger.bids.get(segment.bidId) : undefined;

    if (!bid) {
      // Free (scraped) segment: nothing to clear.
      return { cleared: false };
    }

    if (validCount < required) {
      this.unclearBid(bid, segment);
      return { cleared: false };
    }

    const pool = this.clearBid(bid, segment);
    return { cleared: true, poolId: pool.id };
  }

  /** Threshold met: settle the full bid and create + distribute the pool. */
  private clearBid(bid: BidRow, segment: SegmentRow): RewardPoolRow {
    const balance = this.ledger.balances.get(bid.brandId);
    // Move the reservation into settled spend.
    if (balance) {
      balance.reservedCents -= bid.amountCents;
      balance.spentCents += bid.amountCents;
    }
    bid.status = "cleared";

    const grossCents = bid.amountCents;
    const eligibleCents = splitCents(grossCents, this.config.listenerPct);
    const pool: RewardPoolRow = {
      id: newId("pool"),
      bidId: bid.id,
      grossCents,
      listenerPct: this.config.listenerPct,
      platformPct: this.config.platformPct,
      eligibleCents,
      distributedCents: 0,
      status: "open",
      createdAt: isoNow(),
    };
    this.ledger.rewardPools.set(pool.id, pool);

    this.bus.publish({
      type: "bid.cleared",
      bidId: bid.id,
      segmentId: segment.id,
      grossAmountUsd: centsToUsd(grossCents),
      listenerPoolUsd: centsToUsd(eligibleCents),
      platformRevenueUsd: centsToUsd(grossCents - eligibleCents),
    });
    this.bus.publish({
      type: "reward.pool.updated",
      poolId: pool.id,
      bidId: bid.id,
      eligibleAmountUsd: centsToUsd(eligibleCents),
      distributedAmountUsd: 0,
    });

    this.distributePool(pool, segment);
    return pool;
  }

  /** Distribute the pool proportionally across the segment's valid events. */
  private distributePool(pool: RewardPoolRow, segment: SegmentRow): void {
    const events = this.ledger.validEventsForSegment(segment.id);
    const weights = events.map((e) => ({
      key: e.id,
      weight: e.difficulty * e.uniquenessScore,
    }));
    const shares = distributeCents(pool.eligibleCents, weights);

    let distributed = 0;
    for (const event of events) {
      const amountCents = shares.get(event.id) ?? 0;
      if (amountCents <= 0) continue;
      distributed += amountCents;
      const reward = {
        id: newId("rwrd"),
        listenerSessionId: event.listenerSessionId,
        rewardPoolId: pool.id,
        amountCents,
        status: "credited" as const,
        createdAt: isoNow(),
      };
      this.ledger.listenerRewards.set(reward.id, reward);
      const listener = this.ledger.listeners.get(event.listenerSessionId);
      if (listener) {
        listener.balanceCents += amountCents;
        listener.todayVerifiedCents += amountCents;
      }
    }

    pool.distributedCents = distributed;
    pool.status = "distributed";
    this.bus.publish({
      type: "reward.pool.updated",
      poolId: pool.id,
      bidId: pool.bidId,
      eligibleAmountUsd: centsToUsd(pool.eligibleCents),
      distributedAmountUsd: centsToUsd(distributed),
    });
    pool.status = "closed";
  }

  /** Threshold missed (or generation failed): return the reservation, no pool. */
  unclearBid(bid: BidRow, segment: SegmentRow): void {
    const balance = this.ledger.balances.get(bid.brandId);
    if (balance) {
      balance.reservedCents -= bid.amountCents;
      balance.availableCents += bid.amountCents;
    }
    bid.status = "uncleared";
    this.bus.publish({
      type: "bid.uncleared",
      bidId: bid.id,
      segmentId: segment.id,
      returnedAmountUsd: centsToUsd(bid.amountCents),
    });
  }

  /** Generation failed before playback: abandon the slot, return the hold. */
  failSegment(segmentId: string): void {
    const segment = this.ledger.segments.get(segmentId);
    assert(segment, 404, `unknown segment ${segmentId}`);
    segment.status = "failed";
    segment.windowClosed = true;
    const bid = segment.bidId ? this.ledger.bids.get(segment.bidId) : undefined;
    if (!bid) return;
    const balance = this.ledger.balances.get(bid.brandId);
    if (balance) {
      balance.reservedCents -= bid.amountCents;
      balance.availableCents += bid.amountCents;
    }
    bid.status = "failed";
    this.bus.publish({
      type: "bid.uncleared",
      bidId: bid.id,
      segmentId: segment.id,
      returnedAmountUsd: centsToUsd(bid.amountCents),
    });
  }

  /** Total listener rewards credited to date (for stats + snapshot). */
  totalListenerRewardsCents(): number {
    let total = 0;
    for (const reward of this.ledger.listenerRewards.values()) {
      if (reward.status === "credited") total += reward.amountCents;
    }
    return total;
  }

  /** Total valid attention events to date (for stats + snapshot). */
  totalAttentionProofs(): number {
    let total = 0;
    for (const event of this.ledger.attentionEvents.values()) {
      if (event.result === "valid") total++;
    }
    return total;
  }

  /** For tests/top-ups: expose usdToCents without re-importing. */
  toCents(usd: number): number {
    return usdToCents(usd);
  }
}
