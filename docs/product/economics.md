# Economic Model

## Verified spend

The listener reward is conditional on **verified attention**, not simply on having the stream open.

Example:

- Acme AI bids **$10** for a slot.
- The ad plays.
- During the ad, Slopstream randomly presents a question: "What database did Acme say it supports?"
- The listener answers correctly.
- Slopstream verifies the attention proof.

Then:

```
$10 AD SPEND

        ↓

┌─────────────────────┐
│     SLOPSTREAM      │
│                     │
│  20% platform       │
│  80% listener pool  │
└─────────────────────┘
        ↓
   verified reward
```

- The listener pool receives: **$8.00**
- Slopstream retains: **$2.00**

## Don't pay per question

One important product decision: **don't necessarily give the entire 80% to the person who answers one question.** That creates an easy gaming target.

Instead, create an **Attention Reward Pool**.

```
ACME AD
$10 verified spend

        ↓

$8 listener reward pool

        ↓

distributed according to:
- valid attention events
- difficulty
- duration
- uniqueness
- anti-fraud score
```

So one successful challenge earns a **proportional share** rather than automatically receiving $8.

Example:

```
$8.00 reward pool

12 valid attention events

Listener A    $0.74
Listener B    $0.68
Listener C    $0.81
...
```

This also means multiple listeners can participate simultaneously.

## Bid clearing semantics

The bid shouldn't necessarily clear the instant the first person answers. Instead:

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

This lets the advertiser buy a defined amount of **verified attention**, rather than one lucky quiz response. See [contracts](../technical/contracts.md) for the on-chain side.

## Listener rewards: start with an internal balance

For the hackathon, don't overcomplicate payouts. Start with a listener balance:

```
Listener balance

$0.00

Today's verified attention
+$2.84

Available
$7.42
```

Then make the payout rail a later feature. The demo only needs to prove:

> Verified attention creates an attributable reward.

Actual withdrawal can be Wave 2. This avoids turning the hackathon into a payments/KYC project.

## Legal framing caveat

Economically the 80% is strong. Legally/payment-wise, don't casually market it as "sharing ad revenue" until the rules for target jurisdictions have been checked. For the prototype, **"listener rewards funded by verified attention"** is the cleaner product framing.

## The critical anti-gaming layer

This becomes substantially more important once real rewards are involved. A naive system can be gamed by:

- multiple accounts
- bots
- screen scraping
- replaying answers
- having the ad muted
- opening dozens of tabs
- sharing answers
- automated voice responses

Therefore: **attention ≠ simply answering correctly.** The proof should incorporate multiple conditions. Conceptually:

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

The private listener information should remain private while the contract verifies the required condition. The ProofOfAttention design puts the listener's individual response/session data in private state and exposes only the aggregate clearing information.
