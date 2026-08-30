# Midnight Contracts

Midnight doesn't custody the advertiser's dollars — it proves the conditions under which the backend should update its ledger. Stripe moves dollars. **Midnight proves facts.** See [money architecture](backend.md#money-architecture).

The contract architecture revises the original design. Instead of only `BidClearing`, `ProofOfAttention`, and `PreviewRightsThreshold`, it adds `RewardClearing` and changes the bid clearing semantics.

## 1. ProofOfAttention

The core primitive.

```
submitAttentionProof(
    listenerCommitment,
    segmentId,
    challengeId,
    resultProof
)
```

Proves: **a valid listener satisfied the challenge for this specific segment.**

Private:

- listener identity
- answer
- session information
- detailed interaction data

Public:

- aggregate verified attention
- segment verification status

Conceptually, valid attention is the conjunction of:

```
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

Handles the auction.

```
placeBid(
    brandId,
    amount,
    segmentSlot
)
```

Then:

```
clearBid(
    bidId,
    attentionProof
)
```

The semantics matter: the bid does **not** necessarily clear the instant the first person answers. Instead:

```
BID
 ↓
AD PLAYS
 ↓
ATTENTION WINDOW
 ↓
VALID ATTENTION EVENTS
 ↓
CLEARING
 ↓
REWARD POOL CREATED
```

This lets the advertiser buy a defined amount of verified attention, rather than one lucky quiz response.

## 3. RewardClearing

New contract. Responsible for proving that a reward pool has been generated and distributing the accounting claim.

```
createRewardPool(
    clearedBid,
    rewardAmount
)
```

Then:

```
claimReward(
    listenerCommitment,
    rewardProof
)
```

This makes the economic relationship explicit: **verified advertiser spend → listener reward pool**.

For the hackathon, fully on-chain RewardClearing is P2 — the backend ledger can handle distribution first. See [build order](../hackathon/build-order.md).

## 4. PreviewRightsThreshold

Keep this as the stretch goal.

A brand proves it has crossed a spending threshold **without exposing its exact spend**. That unlocks premium preview/approval functionality.
