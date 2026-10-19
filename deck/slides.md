# Slopstream — Wave 3 Deck (8 slides)

> Scaffold for the AKINDO deck. Keep each slide to ONE claim + ONE visual.

## 1. The problem — attention fraud is unverifiable

Ad platforms report their own numbers. Brands pay for "impressions" they cannot
check, and checking harder means building surveillance databases of who watched
what. Verification today = trust the platform OR violate privacy.

Visual: split-screen — an ad dashboard's claimed numbers vs. "prove it".

## 2. The thesis — prove the fact, hide the person

**Slopstream proves an ad slot met a verified-attention threshold without
revealing who watched, what they answered, or building a profiling database.**

- Brands can't see viewers.
- Viewers can't be linked across segments.
- Rival brands can't see spend.

Stripe moves dollars. Midnight proves facts.

## 3. The product — a live stream where proof IS the product

Infinite AI-generated ad stream. Brands bid on slots; listeners join via QR,
answer a challenge during the slot, and get paid from the reward pool —
80/20 listeners/platform.

Visual: 6-second loop of the big-screen UI + listener phone.

## 4. Architecture — three Compact contracts

- **ProofOfAttention** — listener attention → on-chain nullifier + counter.
  Verifier-key gated. 4-deep replay window.
- **RewardClearing** — owner opens a pool per cleared bid; per-claim nullifier
  makes every claim exactly-once. Weights stay off-chain.
- **PreviewRightsThreshold** — brand proves `spend >= threshold`; only the
  boolean is public, never the amount.

Visual: contract diagram with what's public vs private color-coded.

## 5. The privacy mechanics (judge slide)

What's private: listener secret (ephemeral, per segment), claim secret
(per claim), brand's exact spend (commitment only).
What's public: nullifiers, verifiedCount, thresholdMet, qualified flag.
What's never on-chain: identity, answers, weights, budgets.

Visual: table — PRIVATE (witness) vs PUBLIC (ledger) vs NEVER ON-CHAIN.

## 6. Verify it yourself — /verify

Every midnight receipt links to `/verify?nullifier=…`. The page reads public
preprod indexer state, shows the raw state SHA-256 BEFORE the verdict, and
offers a console snippet / terminal one-liner / AI prompt that run zero of
our code. "No record" is only ever shown after a successful read.

Visual: screenshot of /verify with the falsifiable-commitment box.

## 7. Wave 2 → Wave 3 — what we shipped this wave

1 contract → 3. 3 → 10 circuits. Caller-gating hole closed. 18/18
zero-install circuit-mirror tests. Receipt provenance end-to-end (txHash).
JUDGES.md + PROOF.md. Honest limits stated on the page.

Visual: two-column diff table (from SUBMISSION.md).

## 8. Roadmap + honest limits

Next: on-chain bid clearing (`BidClearing` is a declared sketch, not hidden),
DUST-funded listener wallets, pilot: 1 live brand + 10 listeners on video.
Not audited. Backend ledger authoritative during the hackathon — the chain
provides auditability and non-repudiation, not independent settlement. Yet.

Visual: timeline Wave1 → Wave2 → Wave3 → next.
