# Midnight Contracts

Midnight doesn't custody the advertiser's dollars — it proves the conditions under which the backend should update its ledger. Stripe moves dollars. **Midnight proves facts.** See [money architecture](backend.md#money-architecture).

Midnight is a privacy-preserving blockchain: its contracts can hold private state and verify conditions over that state without revealing it (via Midnight's zero-knowledge capabilities and the Compact contract language). This is what lets `ProofOfAttention` attest that a listener satisfied a challenge without exposing who the listener was or what they answered.

The contract architecture revises the original design. Instead of only `BidClearing`, `ProofOfAttention`, and `PreviewRightsThreshold`, it adds `RewardClearing` and changes the bid clearing semantics.

## 1. ProofOfAttention

The core primitive.

```text
submitAttentionProof(
    listenerCommitment,
    segmentId,
    challengeId,
    resultProof
)
```

Proves: **a valid listener satisfied the challenge condition for this specific segment.** The proof attests to challenge completion under the required conditions — it does not, and cannot, prove that a human was subjectively "paying attention." The anti-abuse checks raise the cost of faking that condition; they don't turn it into certainty. See [anti-gaming](../product/economics.md#the-critical-anti-gaming-layer).

Private:

- listener identity
- answer
- session information
- detailed interaction data

Public:

- aggregate verified attention
- segment verification status

Conceptually, valid attention is the conjunction of:

```text
VALID ATTENTION

=
correct challenge
+
valid session
+
challenge timing
+
segment binding
+
non-replayable proof
+
anti-abuse checks
```

The private listener information remains private while the contract verifies the required condition. The listener's individual response/session data stays in private state; only aggregate clearing information is exposed. See [anti-gaming](../product/economics.md#the-critical-anti-gaming-layer).

## 2. BidClearing

Handles the auction. The format is an **open ascending (English) auction with second-price clearing**: the winner pays the second-highest bid plus a minimum increment, not their own bid. This makes "bid up to your true valuation and stop" the dominant strategy — no shading, no games. See [auction strategy](../product/economics.md#auction-format-english-ascending-second-price).

```text
placeBid(
    brandId,
    amount,
    segmentSlot
)
```

Then:

```text
clearBid(
    bidId,
    aggregateProof
)
```

`aggregateProof` is a single proof attesting that the segment's attention threshold was met across the full attention window — not one proof per listener. Individual `submitAttentionProof` calls accumulate private state in the contract; `clearBid` consumes the aggregate. The semantics matter: the bid does **not** clear the instant the first person answers. Instead:

```text
BID
 ↓
AD PLAYS
 ↓
ATTENTION WINDOW
 ↓
VALID ATTENTION EVENTS
 ↓
THRESHOLD MET?
 ↓
CLEARING (full bid)
 ↓
REWARD POOL CREATED
```

The bid clears **in full** once the segment reaches a minimum attention threshold — it is not prorated by exactly how many listeners passed. If the threshold isn't met, the bid does not clear. This lets the advertiser buy a defined slot of verified attention that either clears or doesn't, rather than one lucky quiz response or a wobbling partial amount. See [bid clearing semantics](../product/economics.md#bid-clearing-semantics).

## 3. RewardClearing

New contract. Responsible for proving that a reward pool has been generated and distributing the accounting claim.

```text
createRewardPool(
    clearedBid,
    rewardAmount
)
```

Then:

```text
claimReward(
    listenerCommitment,
    rewardProof
)
```

This makes the economic relationship explicit: **verified advertiser spend → listener reward pool**.

The per-listener share is weighted by private factors (difficulty, duration, uniqueness, anti-fraud score — see [economics](../product/economics.md#dont-pay-per-question)). The backend computes each listener's share off-chain from the ledger and submits a `rewardProof` attesting that the claimed amount is the correct proportional share of the pool for that listener's valid attention events, without revealing the weighting inputs or the listener's identity. The contract verifies the proof against the pool's `eligible_amount` and the listener's previously submitted attention proofs, then authorizes the backend to credit the listener's internal balance.

**Trust assumption, stated plainly:** the backend performs the share computation and constructs the `rewardProof` itself, so in this configuration the contract verifies a claim made by the same party that did the math — it provides auditability and non-repudiation of each claimed share, not an independent recomputation. This is acceptable because the hackathon reward balances are internal (no fiat leaves the platform on claim), but it is exactly the assumption fully on-chain RewardClearing removes.

For the hackathon, fully on-chain RewardClearing is P2 — the backend ledger can handle distribution first. See [build order](../hackathon/build-order.md).

## 4. PreviewRightsThreshold

Keep this as the stretch goal.

A brand proves it has crossed a spending threshold **without exposing its exact spend**. That unlocks premium preview/approval functionality.

The product motivation: brands competing in a live auction don't want rivals to see exactly how much they've spent — that reveals strategy and budget. But Slopstream still needs to gate premium features (custom story integration, interactive formats, priority placement) behind a proven spend level. `PreviewRightsThreshold` lets a brand prove "I've spent enough to qualify" without broadcasting the number, so premium tiers unlock privately while the public leaderboard only shows the current bid.
