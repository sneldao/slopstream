# Evergreen Loop — Cold-Start Strategy

> Canonical plan for getting Slopstream to a URL that is alive forever for ~$0/day,
> with no babysitting. Agreed 2026-09-16. This document outranks the old
> "leave the auction running" posture wherever they conflict.

## The problem

With no users and no advertisers, the default deployment is a liability:

- The auction loop closes empty slots every `AUCTION_DURATION_SEC`, burns the 8
  scraped-company fillers, then sits in dead air with backing-off polls.
- Flipping the generator to ElevenLabs with nobody watching mints paid media
  for an empty room — and there are no cost caps (`MAX_DAILY_GENERATION_COST`
  is still unimplemented).
- The mock-USD ledger wipes on every API restart, so nothing persists.

Active management (pause/resume around demos) works but doesn't scale to
"leave it up for months."

## The answer: generate once, loop forever, reward with testnet tokens

Three stages, strictly ordered. Each stage is shippable and valuable on its own.

### Stage 1 — The Eternal Loop (build now)

Pre-generate a stable of 10–15 evergreen segments in **one** ElevenLabs session
(one-time cost), curate the keepers, persist them durably, then run the stream
off that catalog indefinitely with the generator and scraper **off**.

- **Rotation, not playlist.** Segments air as full live windows
  (`playing → challenges → window-closed`) with rotation weights, variety
  penalties (no back-to-back brand repeats — see `pickEncoreCandidate`), and
  boost decay for new entries. It must never feel like a playlist on repeat.
- **Challenges work from day one.** Every catalog entry carries its transcript
  and challenge set, so Q&A, proofs, and thresholds function with zero new
  game code.
- **Zero marginal cost.** Stub generator, no scraper key, no Stripe. VPS runs
  four small containers on timers. $0/day in provider spend.
- **No dead air, ever.** The loop is the primary mode, not a fallback — the
  encore replay path becomes the rotation engine rather than a gap cover.

**Unblock:** durable segment catalog. Today segments live in the in-memory
`Ledger` (`apps/api/src/ledger.ts`) and `recentSegments` is age-capped at
30 min / max 8 (`apps/api/src/snapshot.ts`) — a restart wipes the stable.
Minimum viable persistence: finished segments (media manifest + transcript +
challenges + rotation weight) to SQLite/disk, reseeded on boot.

### Stage 2 — Testnet $SLOPSTREAM rewards (next)

Replace fictional mock-USD balances with a real-but-worthless testnet token:

- Deploy `$SLOPSTREAM` on a testnet (Midnight preprod keeps the story pure;
  a cheap EVM testnet is faster tooling-wise — decide explicitly, document it).
- Start **custodial/off-chain**: the API tracks `pendingTokenRewards`, a faucet
  drips on payout request. On-chain distribution per proof comes later
  (expensive and complex even on testnet).
- Persist balances (SQLite minimum). Nothing kills "earn tokens" faster than a
  restart zeroing wallets.
- Anti-Sybil minimum: per-browser session persistence, rate limits, replay
  protection via nullifier, threshold fraction. Expect multi-tab farming on
  day two — don't claim Sybil-proofness, just make it non-trivial.
- Frame it as **points-with-a-ledger** (status, slots), never as money. No USD
  value promises — that road leads to money-transmitter land.

### Stage 3 — Advertiser staking (only when someone knocks)

Manual onboarding first: advertiser sends docs/links → we screen NSFW →
we craft the segment → it enters rotation. Curation *is* the quality filter.

- **Rotation weight = ad product.** New advertiser content gets boosted
  rotation for N plays/days, then decays to the long tail unless re-staked.
  One field (`weightUntil`) on the segment — not a new auction system.
- **Staking mechanics:** advertiser buys `$SLOPSTREAM` (creating demand),
  stakes for a slot, stake streams to attentive listeners. Start simple:
  advertiser sends tokens to a pool address, API watches it and credits the
  reward pool for that segment's windows. On-chain escrow later.
- **The live auction hibernates** until two advertisers compete for the same
  slot — a good problem. Slots are rotation positions, not auction windows.

## Privacy boundary (non-negotiable)

The cold open promises *"Prove they watched. Never reveal who."* The
advertiser story must not break it:

- **Default:** advertisers learn counts and proofs, never identities —
  "47 verified attentions, 12 nullifiers on-chain, here's the ZK proof."
  This is what `ProofOfAttention` nullifiers already give.
- **Opt-in upgrade:** a listener may voluntarily reveal a field (handle,
  email) to a brand for a bigger reward. Consent + selective disclosure —
  exactly what Midnight is for.
- **Never:** raw per-session linkage by default.

Advertiser analytics are **aggregate-only plus voluntarily-shared fields**.
Same value, privacy intact.

## Content policy (write it down before Stage 3)

- All ads clearly labeled unofficial AI-generated parody (extends the existing
  free-segment brief).
- No real-brand defamation, no adult / pharma / crypto-yield claims.
- A human (us) is the filter until volume forces tooling.

## Cadence

One new segment a week keeps the loop fresh; every addition is a tiny
one-time cost. Staleness is the failure mode — a 12-segment loop gets old,
so the curation habit matters more than the catalog size.

## What this defers (explicitly)

Live auction/bidding, Stripe, 24/7 Parallel scraper, on-chain per-proof
distribution, self-serve advertiser UI, ClickHouse/Gemini partner tracks.
All real directions, none needed for a loop that is alive forever for $0.
