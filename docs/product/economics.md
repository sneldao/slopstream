# Economic Model

## Verified spend

The listener reward is conditional on **verified attention**, not simply on having the stream open.

Example:

- Acme AI bids **$10** for a slot.
- The ad plays.
- During the ad, Slopstream randomly presents a question: "What database did Acme say it supports?"
- The listener answers correctly, and enough other listeners clear the challenge to meet the segment's attention threshold.
- Slopstream verifies the attention proofs and clears the bid.

Then:

```text
$10 CLEARED SPEND

        ↓

┌─────────────────────┐
│     SLOPSTREAM      │
│                     │
│  20% platform       │
│  80% listener pool  │
└─────────────────────┘
        ↓
   listener reward pool
```

- The listener pool receives: **$8.00**
- Slopstream retains: **$2.00**

The **80/20 split is the default**, not a hard rule. Each reward pool stores its own `listener_percentage` / `platform_percentage` (see [ledger](../technical/backend.md#backend-ledger)), so the split is configurable per pool or per campaign; 80/20 is what the demo uses.

## Don't pay per question

One important product decision: **don't necessarily give the entire 80% to the person who answers one question.** That creates an easy gaming target.

Instead, create an **Attention Reward Pool**.

```text
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

```text
$8.00 reward pool

12 valid attention events

Listener A    $0.74
Listener B    $0.68
Listener C    $0.81
...
```

Note: these figures are illustrative. Per-listener amounts are weighted by the factors above and won't divide evenly — they convey the shape of distribution, not exact math.

This also means multiple listeners can participate simultaneously.

## Bid clearing semantics

A bid does **not** clear the instant the first person answers. Instead:

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

Clearing works in two stages, and it's worth keeping them separate:

- **The bid clears in full** once the segment reaches a **minimum attention threshold** (enough valid attention events in the window). It is not prorated by the exact number of listeners who passed — a segment that hits the threshold clears the whole bid.
- **The pool is then distributed proportionally** among the valid attention events (by difficulty, duration, uniqueness, anti-fraud score).

So the advertiser buys a defined slot of verified attention that either clears (threshold met) or doesn't (threshold missed) — not one lucky quiz response, and not a wobbling partial amount. If the threshold isn't met, the bid does not clear and the funds return to the brand balance (see [uncleared bids](../technical/backend.md#uncleared-and-failed-bids)). See [contracts](../technical/contracts.md) for the on-chain side.

## Auction strategy and theory

The auction is the economic engine, and several of its dynamics are worth making explicit — both for the demo story and for the product beyond the hackathon.

### The auction is an allocation mechanism; the threshold is the price setter

The most important framing: **the ascending bid decides *who* gets the slot; the attention threshold decides *whether anyone pays*.** A brand's expected cost is not their bid — it's:

```text
expected cost = bid × P(threshold met | audience, ad quality, slot)
```

This means brands are effectively bidding on an *option* on verified attention, not a guaranteed impression. Two consequences:

- **Brands should bid higher than in a pay-per-impression model**, because they only pay on verified delivery. The auction is selling a conditional claim, not a sure thing.
- **The threshold is the hidden price-setting parameter** — arguably more important than the auction format. Set it too high and bids rarely clear (Slopstream earns nothing, brands leave). Set it too low and attention is meaningless (listeners are rewarded for nothing, the proof is theater). The threshold is what actually prices verified attention; the auction just allocates the slot.

### Auction format: English ascending; first-price now, second-price later

The live leaderboard with public bids and OUTBID animation is an **open ascending (English) auction**.

**Hackathon: first-price — the winner pays their own bid.** When a segment clears the attention threshold, the full bid amount clears (see [bid clearing semantics](#bid-clearing-semantics)). That keeps the money story one sentence long — "they bid $18, $18 cleared" — and avoids second-highest-bid bookkeeping, one-bidder edge cases, and reserve-price interactions at demo scale. With two or three scripted brands in a five-minute session, the strategic problem first-price creates is never visible.

**Product direction: second-price.** The winner pays the second-highest bid plus a minimum increment. In a true English auction the dominant strategy is *bid up to your true valuation and stop* — no shading, no games — which is the theoretically efficient outcome. Under first-price, real competing brands shade below true value and the auction becomes strategically complex. The OUTBID animation is also more meaningful under second-price: a brand isn't bidding against itself, it's being asked "do you want to exceed the current standing bid by one increment?" — and it only pays that increment over the previous bid.

The switch is a clearing-rule change in BidClearing; the auction surface, bid events, and ledger shapes don't change.

### Audience size is slot value — and it's not in the auction yet

Slot value is endogenous to audience size:

```text
slot value ≈ f(listeners watching, P(threshold met), listener quality)
```

A slot with 100 listeners and a slot with 10,000 listeners have vastly different values, but the current auction doesn't adjust for this. Two failure modes if it stays unaddressed:

- **Low-listener slots sell at the same nominal price as high-listener slots** → brands get burned on empty rooms → they shade bids down across the board → revenue collapses.
- **Brands can't tell ex ante how many listeners a slot will reach** → adverse selection → only brands with low attention requirements bid → race to the bottom.

The big screen already shows "👀 1,284 listeners" — but it's not connected to the bid dynamics. A brand should be able to reason: "1,284 listeners, threshold is ~60%, so ~770 verified attention events possible, my $20 bid clears at ~$0.026/verified attention." For the hackathon, surfacing listener count in the [bidding console](surfaces.md#c-the-brand-bidding-console) is the minimum viable fix; dynamic per-listener pricing is a later feature.

### Sequential auction effects

Slots are auctioned one after another in an infinite stream. Sequential auctions of comparable goods have well-known pathologies:

- **Declining price anomaly.** In sequential auctions, prices tend to *decline* over a session (documented in wine, art, cattle, and real estate auctions). Causes: budget depletion (brands spend early), risk aversion (later slots are "safer" because you've observed outcomes), and winner's-curse learning.
- **Strategic waiting.** If a brand expects later slots to be cheaper — or expects competitors to exhaust budgets — they'll skip early slots. This can produce dry spells in the stream: gaps where no one bids, which kills listener engagement, which lowers future slot values. A negative feedback loop.
- **Budget allocation.** A brand with $500 isn't deciding "how much is this slot worth" — they're deciding "how do I allocate $500 across N upcoming slots?" The current docs treat each bid as independent, but a sophisticated brand is solving a portfolio problem.

For the hackathon these effects won't appear (the demo is a single session, a few minutes, a few brands). For the product, the simplest mitigations:

- **A reserve / floor price** on each slot, so the stream never visibly deflates to $0.
- **A next-slot price that ratchets** (doesn't fall below the last cleared price minus a decay factor), keeping forward momentum.

### Collusion and signaling

Open ascending auctions with public brand identities are the most collusion-susceptible format. Brands can signal through bid increments ("I bid $31, take the hint"), punish rivals by bidding up their slots, or rotate ("you take this slot, I'll take the next"). For the hackathon this is irrelevant (2–3 brands, 5-minute demo). For a real product, the available fallbacks are **sealed-bid components** (e.g., a sealed opening round followed by open escalation) or **bid anonymity** (brands see bids but not who placed them). Note the risk; don't build the fix yet.

### The listener side is a participation game, not a market

The deepest gap: the product is called "a marketplace for human attention," but only one side (brands) is actually *transacting*. Listeners receive ads, prove attention, and earn rewards — but they have no market power. They can't signal preference ("I'd pay attention to a developer-tools ad"), can't withhold attention strategically, and can't price their own attention.

This is a deliberate simplification, not an oversight — adding listener-side price discovery would massively complicate the product. But it's worth being explicit about: **Slopstream is a one-sided market with a participation game on the listener side, not a two-sided market.** The social effects that *do* exist on the listener side are herding ("1,284 people are watching" → more join) and social proof of attention ("127/143 verified"), both of which are already surfaced on the big screen. A future two-sided version — where listeners signal preferences that feed back into auction pricing — is a real product direction, but it's not this product.

## Listener rewards: start with an internal balance

For the hackathon, don't overcomplicate payouts. Start with a listener balance:

```text
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

The private listener information should remain private while the contract verifies the required condition. The ProofOfAttention design puts the listener's individual response/session data in private state and exposes only the aggregate clearing information.
