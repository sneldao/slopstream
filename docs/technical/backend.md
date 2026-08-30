# Backend: Money Architecture, Ledger, and Challenge Engine

## Money architecture

**Stripe remains the only real-money rail.** This is important.

```text
Brand
  │
  │ $100
  ▼
Stripe
  │
  ▼
Slopstream balance
  │
  │ $10 bid
  ▼
BidClearing
  │
  │ verified attention
  ▼
$10 cleared
  │
  ├──── $2 ──── Slopstream
  │
  └──── $8 ──── Listener Reward Pool
```

Midnight doesn't custody the advertiser's dollars. It proves the conditions under which the backend should update its ledger.

That preserves the clean separation:

> **Stripe moves dollars. Midnight proves facts.**

## Domain vocabulary

These terms are used precisely throughout the docs:

- **Bid** — a brand's offer for an upcoming ad **slot** (a row in `bids`). One winning bid maps to exactly one slot.
- **Slot** — a position in the stream queue that a bid competes for. The winning bid's slot is realized as one **segment**.
- **Segment** — one generated ad unit that actually plays (a row in `segments`), e.g. `seg_392`. A segment carries one or more challenges.
- **Attention challenge** — a question fired during a segment (`attention_challenges`). Each references its `segmentId`.
- **Attention event** — a single listener's valid response to a challenge (`attention_events`); the unit the reward pool is distributed over.

In short: **one bid → one slot → one segment → N challenges → many attention events → one reward pool.**

## Live event contract

The live-event stream is the single integration seam between the orchestrator/backend and every screen (see [team split](../hackathon/team-split.md#the-seams-contract-first-on-day-1)). The authoritative event contract is the `WsEvent` discriminated union in [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts) — this table mirrors it. When the two disagree, the shared types win.

### Commands and snapshots use HTTPS

The WebSocket is a **server-to-client projection**, not a mutation API. Clients use authenticated HTTPS endpoints for every state-changing or private operation:

| Operation                        | Transport                                      | Result                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create a brand account           | `POST /brands`                                 | `BrandSummary` + one-time bearer token                                                                                                                             |
| Top up a brand balance           | `POST /top-ups`                                | Mock-Stripe charge (hackathon) + updated balance                                                                                                                   |
| Place or raise a bid             | `POST /bids`                                   | Persisted bid; API later publishes `bid.*` events                                                                                                                  |
| Create/resume a listener session | `POST /listener-sessions`                      | Session token / identity (bearer resumes the same session)                                                                                                         |
| Read listener balance           | `GET /listener-sessions/me`                    | Authenticated available/pending balance and verification total                                                                                                     |
| Submit a challenge response      | `POST /attention-proofs`                       | Private verification result / receipt                                                                                                                              |
| Request a listener payout       | `POST /listener-sessions/me/payout-request`    | Records a hackathon payout request and debits the available internal balance; no external payout rail yet                                                          |
| Load or recover stream state     | `GET /stream/snapshot`                         | Current segment, eight recent completed segments, the next generated/ready queue, brand palettes, public leaderboard/stats, open auction deadline, active `PublicChallenge`, and an `asOfSequence` |
| Poll auction state               | `GET /auctions/current`, `GET /auctions/:slot` | `AuctionState` (status, deadline, standing bid, winner + `segmentId` after close)                                                                                  |

Brand and listener commands authenticate with their bearer token. The orchestrator additionally authenticates with `ORCHESTRATOR_API_TOKEN` and drives the per-segment lifecycle against Lane 2 — `POST /segments/:id/generating`, `/ready`, `/challenge-source`, `/challenges/next` (Lane 3 decides when to fire; the response is a `PublicChallenge`, never the answer), `/playing` (opens the attention window and freezes `required_events`), `/window-closed` (exactly-once clearing evaluation), and `/failed` — so clearing state stays in the ledger even though playback lives in Lane 3. Invoking the generator similarly requires `GENERATOR_API_TOKEN`; production processes refuse to start with the checked-in demo defaults.

Commands are authenticated and validated at the API boundary; the API persists the result before it publishes the corresponding marketplace event to Redis. The current hackathon server uses an in-memory ledger and has no request-idempotency or durable audit-log layer yet, so those are production follow-ups rather than current guarantees. Clients must never treat a WebSocket message as evidence that a bid, balance, proof, or reward is settled.

### Listener session identity

`POST /listener-sessions` creates an anonymous listener session and returns an opaque session token. The listener client stores that token and its browser-generated commitment in `sessionStorage`, then presents the token as a bearer credential on every listener API call (`POST /attention-proofs`, `GET /listener-sessions/me`, and payout request). The API binds the commitment at session creation and rejects a proof whose commitment does not match the authenticated session. Reconnecting within the browser session with the same token resumes the session — same balance, same attention history; a new token means a new listener. For the hackathon this is the entire identity story: no accounts, no device attestation. The token is also the unit anti-fraud scoring operates on — `uniqueness_score` weights attention events by how plausible it is that the session is one distinct human, which is why session resumption matters even though it is invisible in the UI.

### WebSocket projections, audiences, and reconnects

The current `WsEvent` union contains only public/aggregate events: now playing, leaderboard, generation, public challenge, aggregate attention, and clearing. The listener client renders a public challenge only when the person has enabled Earn Mode; the event itself carries neither a response requirement nor listener identity. Listener proof receipts/balances and brand balance/campaign state are returned through authenticated HTTPS responses and snapshots for the hackathon; they are never put on the public live feed.

If a later release adds a private WebSocket update, it must define a separately scoped event type, authenticate the target listener session or brand account, and authorize delivery at the gateway. Do not add a private field to a public `WsEvent`.

Every gateway delivery wraps a `WsEvent` in a `WsDelivery` envelope carrying a monotonic `sequence` and opaque `eventId`. `WsDelivery` is defined in `packages/shared`, so all clients deduplicate and order deliveries against one shared shape. The sequence is transport metadata; the underlying `WsEvent` remains the business-event union described below.

For the hackathon, Redis pub/sub does **not** need to become a durable replay log. On initial load or reconnect, the client fetches `GET /stream/snapshot` — a `StreamSnapshot` from `packages/shared` (`asOfSequence`, now playing, recent completed segments, a small generated/ready queue, brands, leaderboard, open auction deadline, stats, active `PublicChallenge`) — renders that authoritative state, and records its `asOfSequence`. It applies only later events; a duplicate is ignored, and a sequence gap triggers another snapshot fetch. This makes a dropped mobile connection recoverable without making the socket itself durable. `recentSegments` is newest-first and capped at eight so the visual Continuum survives recovery without turning the public snapshot into an unbounded archive; `upcomingSegments` is limited to the next two queue entries for the screen’s “Coming up” cue.

### Public event reference

| Event                 | Emitted when                                 | Key payload                                                                                                                          |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bid.placed`          | A brand places or raises a bid               | `bidId`, `brandId`, `amount`, `slot`                                                                                                 |
| `bid.outbid`          | A standing bid is overtaken                  | `slot`, displaced `bidId`/`brandId`, new `bidId`/`brandId`, `prevAmountUsd`, `newAmountUsd`                                          |
| `leaderboard.updated` | Ranking/next-slot price changes              | ranked `[{ brandId, amount }]`, `nextSlotPrice`                                                                                      |
| `auction.opened`      | A new bidding window opens                   | `slot`, `closesAt`, `nextSlotPriceUsd`                                                                                               |
| `segment.generating`  | Winning slot starts generation               | `segmentId`, `slot`, `tier`, `brandId`                                                                                               |
| `generation.progress` | A generation stage completes                 | `slot`, `stage` (script / voice / image / video), `done`                                                                             |
| `segment.ready`       | Generated asset is available                 | `segmentId`, `assetUrl`, `durationSec`                                                                                               |
| `segment.playing`     | Segment begins playback                      | `segmentId`, `brandId`, `startedAt`                                                                                                  |
| `challenge.fired`     | A challenge is pushed to listeners           | `PublicChallenge` object (`challengeId`, `segmentId`, `question`, `validFrom`, `validUntil`, `difficulty`) — **excludes the answer** |
| `attention.verified`  | A valid attention event is recorded          | `segmentId`, aggregate `verifiedCount` / `total` / `threshold` (no listener identity)                                                |
| `bid.cleared`         | Segment met threshold; bid clears            | `bidId`, `segmentId`, `grossAmount`, `listenerPool`, `platformRevenue`                                                               |
| `bid.uncleared`       | Threshold missed; bid returned               | `bidId`, `segmentId`, `returnedAmount`                                                                                               |
| `bid.failed`          | Generation failed pre-playback; bid returned | `bidId`, `segmentId`, `returnedAmount`                                                                                               |
| `reward.pool.updated` | Pool created or distributed                  | `poolId`, `bidId`, `eligibleAmount`, `distributedAmount`                                                                             |
| `stats.updated`       | Periodic big-screen stat refresh             | `listeners`, `attentionProofs`, `listenerRewardsUsd`                                                                                 |

Payloads carry only aggregate/public data — no listener identity or answers cross the WebSocket (see [ProofOfAttention](contracts.md#1-proofofattention)).

## Backend ledger

Postgres is the target accounting ledger. **The current hackathon implementation uses in-memory Maps** shaped like this schema; all amount columns remain integer cents, the shared wire types expose USD as numbers (`amountUsd`, `grossAmountUsd`, …), and the API boundary converts once. Clearing math (`gross × 80%`) and pool distribution run in integer cents with round-to-cent, so no float drift reaches the ledger.

- `brands`
- `brand_balances`
- `bids`
- `segments`
- `attention_challenges`
- `listener_sessions`
- `attention_events`
- `reward_pools`
- `listener_rewards`
- `payouts`
- `scraped_companies` — the cold-start queue (docs/product/content.md)

### Cold-start scraper

The orchestrator runs an optional scraper (`apps/orchestrator/src/scraper.ts`)
backed by the [Parallel Search API](https://docs.parallel.ai) (`PARALLEL_API_KEY`;
disabled when unset, cadence via `SCRAPER_POLL_MS`). Each discovery pass posts
`ScrapedCompanySubmission`s to **`POST /companies/scraped`** (orchestrator
bearer), which dedupes by `sourceUrl` and `(source, name)` into the
`scraped_companies` queue; `GET /companies/scraped` lists the unused backlog.
When an auction closes with **no bids**, the auction engine consumes the oldest
unused company, realizes a free segment (`brandId = null`, brief built from the
scraped data, tier `audio`), and exposes it as `AuctionState.freeSegment` — the
orchestrator then drives its full lifecycle exactly like a won slot, using the
`FREE_BRAND_ID` pseudo-brand for public events. No money moves and no reward
pool ever exists for a free segment.

The three tables the demo actually touches, beyond `reward_pools` below:

`bids` — one row per brand offer for a slot:

| column       | notes                                                 |
| ------------ | ----------------------------------------------------- |
| `id`         |                                                       |
| `brand_id`   |                                                       |
| `amount`     | current bid amount                                    |
| `slot`       | the stream slot being contested                       |
| `tier`       | production tier (audio / image / video / premium)     |
| `status`     | `pending → won / lost / cleared / uncleared / failed` |
| `segment_id` | set once the bid wins and generates a segment         |
| `created_at` |                                                       |

`attention_events` — one row per listener's valid response to a challenge:

| column                | notes                           |
| --------------------- | ------------------------------- |
| `id`                  |                                 |
| `listener_session_id` |                                 |
| `segment_id`          |                                 |
| `challenge_id`        |                                 |
| `result`              | `valid / invalid`               |
| `difficulty`          | weight for reward distribution  |
| `duration_sec`        | weight for reward distribution  |
| `uniqueness_score`    | anti-fraud weight               |
| `proof_ref`           | reference to the on-chain proof |
| `created_at`          |                                 |

`listener_rewards` — one row per listener's share of a reward pool:

| column                | notes                       |
| --------------------- | --------------------------- |
| `id`                  |                             |
| `listener_session_id` |                             |
| `reward_pool_id`      |                             |
| `amount`              | proportional share credited |
| `status`              | `credited / withdrawn`      |
| `created_at`          |                             |

Example — `reward_pools`:

| column                | notes                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| `id`                  |                                                                                |
| `bid_id`              |                                                                                |
| `gross_amount`        | e.g. `$10.00`                                                                  |
| `listener_percentage` | e.g. `80%`                                                                     |
| `platform_percentage` | e.g. `20%`                                                                     |
| `eligible_amount`     | e.g. `$8.00` listener pool                                                     |
| `distributed_amount`  |                                                                                |
| `status`              | `pending → open → distributed / closed` (mirrors `RewardPoolStatus` in shared) |
| `created_at`          |                                                                                |

So for a $10 cleared bid:

```text
gross_amount        = $10.00
listener_percentage = 80%
platform_percentage = 20%

listener_pool       = $8.00
platform_revenue    = $2.00
```

Listener rewards begin **pending** while the segment settles and become
**available** when the reward pool is distributed. The listener UI may request
a payout against the available balance, but the hackathon endpoint only records
that request and debits the internal ledger; external payout rails remain a
later feature. See [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance).

### Uncleared and failed bids

A bid only clears when its segment reaches the minimum attention threshold. Otherwise the funds don't leave the brand's balance:

- **Threshold missed** — not enough valid attention events in the window. The bid does not clear, no reward pool is created, and the reserved amount returns to `brand_balances`. Emits `bid.uncleared`.
- **Generation failed** — the segment never played (sandbox error, timeout). The slot is abandoned and the reserved amount returns to the brand balance; no spend is recorded. Emits `bid.failed`.
- **Partial attention above threshold** — the bid clears in **full** (clearing is threshold-gated, not prorated); only the _pool distribution_ reflects how many listeners passed. See [bid clearing semantics](../product/economics.md#bid-clearing-semantics).

The `bids.status` and `reward_pools.status` columns track these outcomes (bids: `pending → won / lost`, then `won → cleared | uncleared | failed`; pools mirror the clearing result). No Stripe charge is ever reversed here — top-ups already landed as balance; only the internal reservation is released.

## Attention threshold and the attention window

The threshold is what prices verified attention (see [auction strategy](../product/economics.md#auction-strategy-and-theory)), so its mechanics are pinned down here rather than left implicit.

- **Stored per segment.** `segments` carries `threshold_fraction` — the platform-set fraction of the audience that must verify (demo default `0.6`) — and `required_events`, the absolute count of valid attention events the segment must reach for its bid to clear. For the hackathon the platform sets one global fraction; per-tier or per-brand fractions are a later knob.
- **Frozen at window open.** The attention window opens at `segment.playing`. At that instant the backend computes `required_events = ceil(threshold_fraction × recently active listeners at window open)` and stores it. A session counts only when it has checked in within `ACTIVE_LISTENER_WINDOW_SEC` (demo default 120 seconds), so abandoned historical sessions cannot inflate the threshold. Listeners who join mid-segment can still earn attention events, but they do not move the goalposts.
- **Why frozen:** a brand's expected cost (`bid × P(threshold met)`) must be knowable, and a live denominator would let a late audience surge or exodus flip whether an already-played ad clears.
- **Window close.** The window closes at segment end of playback plus a short grace period (~3s) for in-flight submissions. All of a segment's challenges expire within it (`validUntil` ≤ segment duration), so there is nothing to wait for beyond the grace.
- **Clearing is evaluated exactly once.** At window close the backend compares valid attention events against `required_events`: met → the bid clears in full and the pool is created (`bid.cleared`, then `reward.pool.updated`); missed → the reserved amount returns (`bid.uncleared`). Exactly one of the two events fires per segment — no partial clearing, no re-evaluation.
- **Surfaced to the screens.** The frozen `required_events` rides along in `attention.verified` (`threshold`) and in the snapshot (`nowPlayingAttentionThreshold`), so the big screen's liquid-threshold fill knows where 100% is before the first verification arrives.

## Attention challenge engine

The backend maintains a challenge queue.

```text
ChallengeGenerator

input:
  segment
  transcript
  visual metadata
  audio metadata
  difficulty
  previous challenges

output:
  challenge
  answer
  challengeType
  validityWindow
```

Example:

```json
{
  "type": "multiple_choice",
  "question": "What database did Acme mention?",
  "options": ["Redis", "Postgres", "MongoDB", "SQLite"],
  "answer": "Postgres",
  "segmentId": "seg_392",
  "validFrom": 83,
  "validUntil": 97
}
```

`validFrom` / `validUntil` are **seconds from the start of the segment** — here the challenge is answerable between 0:83 and 0:97 of `seg_392`. (The same two fields appear in the shared challenge payload used across all lanes.)

For the demo, **pre-generate challenges from the script/transcript** rather than trying to create them synchronously during playback.

The stream orchestrator decides _when_ challenges fire (randomized timing); the challenge engine decides _what_ they are. See [challenge types](../product/content.md#randomized-attention-challenges).
