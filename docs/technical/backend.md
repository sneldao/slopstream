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

| Operation | Transport | Result |
| --- | --- | --- |
| Create/resume a listener session | `POST /listener-sessions` | Session token / identity |
| Place or raise a bid | `POST /bids` | Persisted bid; API later publishes `bid.*` events |
| Top up a brand balance | `POST /top-ups` | Stripe checkout/session state |
| Submit a challenge response | `POST /attention-proofs` | Private verification result / receipt |
| Load or recover stream state | `GET /stream/snapshot` | Current segment, public leaderboard/stats, active `PublicChallenge`, and an `asOfSequence` |

Commands are authenticated, validated, logged, and idempotent at the API boundary. The API persists the result before it publishes the corresponding marketplace event to Redis. Clients must never treat a WebSocket message as evidence that a bid, balance, proof, or reward is settled.

### WebSocket projections, audiences, and reconnects

The current `WsEvent` union contains only public/aggregate events: now playing, leaderboard, generation, public challenge, aggregate attention, and clearing. Listener proof receipts/balances and brand balance/campaign state are returned through authenticated HTTPS responses and snapshots for the hackathon; they are never put on the public live feed.

If a later release adds a private WebSocket update, it must define a separately scoped event type, authenticate the target listener session or brand account, and authorize delivery at the gateway. Do not add a private field to a public `WsEvent`.

Every gateway delivery wraps a `WsEvent` in a `WsDelivery` envelope carrying a monotonic `sequence` and opaque `eventId`. `WsDelivery` is defined in `packages/shared`, so all clients deduplicate and order deliveries against one shared shape. The sequence is transport metadata; the underlying `WsEvent` remains the business-event union described below.

For the hackathon, Redis pub/sub does **not** need to become a durable replay log. On initial load or reconnect, the client fetches `GET /stream/snapshot` — a `StreamSnapshot` from `packages/shared` (`asOfSequence`, now playing, leaderboard, stats, active `PublicChallenge`) — renders that authoritative state, and records its `asOfSequence`. It applies only later events; a duplicate is ignored, and a sequence gap triggers another snapshot fetch. This makes a dropped mobile connection recoverable without making the socket itself durable.

### Public event reference

| Event | Emitted when | Key payload |
| --- | --- | --- |
| `bid.placed` | A brand places or raises a bid | `bidId`, `brandId`, `amount`, `slot` |
| `bid.outbid` | A standing bid is overtaken | `bidId`, `prevAmount`, `newAmount`, `brandId` |
| `leaderboard.updated` | Ranking/next-slot price changes | ranked `[{ brandId, amount }]`, `nextSlotPrice` |
| `segment.generating` | Winning slot starts generation | `segmentId`, `slot`, `tier` |
| `generation.progress` | A generation stage completes | `slot`, `stage` (script / voice / image / video), `done` |
| `segment.ready` | Generated asset is available | `segmentId`, `assetUrl`, `durationSec` |
| `segment.playing` | Segment begins playback | `segmentId`, `startedAt` |
| `challenge.fired` | A challenge is pushed to listeners | `PublicChallenge` object (`challengeId`, `segmentId`, `question`, `validFrom`, `validUntil`, `difficulty`) — **excludes the answer** |
| `attention.verified` | A valid attention event is recorded | `segmentId`, aggregate `verifiedCount` / `total` (no listener identity) |
| `bid.cleared` | Segment met threshold; bid clears | `bidId`, `segmentId`, `grossAmount`, `listenerPool`, `platformRevenue` |
| `bid.uncleared` | Threshold missed; bid returned | `bidId`, `segmentId`, `returnedAmount` |
| `reward.pool.updated` | Pool created or distributed | `poolId`, `bidId`, `eligibleAmount`, `distributedAmount` |
| `stats.updated` | Periodic big-screen stat refresh | `listeners`, `attentionProofs`, `listenerRewardsUsd` |

Payloads carry only aggregate/public data — no listener identity or answers cross the WebSocket (see [ProofOfAttention](contracts.md#1-proofofattention)).

## Backend ledger

Postgres keeps the actual accounting ledger. Core tables:

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

The three tables the demo actually touches, beyond `reward_pools` below:

`bids` — one row per brand offer for a slot:

| column | notes |
| --- | --- |
| `id` | |
| `brand_id` | |
| `amount` | current bid amount |
| `slot` | the stream slot being contested |
| `tier` | production tier (audio / image / video / premium) |
| `status` | `pending → won / lost / cleared / uncleared / failed` |
| `segment_id` | set once the bid wins and generates a segment |
| `created_at` | |

`attention_events` — one row per listener's valid response to a challenge:

| column | notes |
| --- | --- |
| `id` | |
| `listener_session_id` | |
| `segment_id` | |
| `challenge_id` | |
| `result` | `valid / invalid` |
| `difficulty` | weight for reward distribution |
| `duration_sec` | weight for reward distribution |
| `uniqueness_score` | anti-fraud weight |
| `proof_ref` | reference to the on-chain proof |
| `created_at` | |

`listener_rewards` — one row per listener's share of a reward pool:

| column | notes |
| --- | --- |
| `id` | |
| `listener_session_id` | |
| `reward_pool_id` | |
| `amount` | proportional share credited |
| `status` | `credited / withdrawn` |
| `created_at` | |

Example — `reward_pools`:

| column | notes |
| --- | --- |
| `id` | |
| `bid_id` | |
| `gross_amount` | e.g. `$10.00` |
| `listener_percentage` | e.g. `80%` |
| `platform_percentage` | e.g. `20%` |
| `eligible_amount` | e.g. `$8.00` listener pool |
| `distributed_amount` | |
| `status` | |
| `created_at` | |

So for a $10 cleared bid:

```text
gross_amount        = $10.00
listener_percentage = 80%
platform_percentage = 20%

listener_pool       = $8.00
platform_revenue    = $2.00
```

Listener rewards start as an **internal balance** — payout rails are a later feature. See [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance).

### Uncleared and failed bids

A bid only clears when its segment reaches the minimum attention threshold. Otherwise the funds don't leave the brand's balance:

- **Threshold missed** — not enough valid attention events in the window. The bid does not clear, no reward pool is created, and the reserved amount returns to `brand_balances`. Emits `bid.uncleared`.
- **Generation failed** — the segment never played (sandbox error, timeout). The slot is abandoned and the reserved amount returns to the brand balance; no spend is recorded.
- **Partial attention above threshold** — the bid clears in **full** (clearing is threshold-gated, not prorated); only the *pool distribution* reflects how many listeners passed. See [bid clearing semantics](../product/economics.md#bid-clearing-semantics).

The `bids.status` and `reward_pools.status` columns track these outcomes (bids: `pending → won / lost`, then `won → cleared | uncleared | failed`; pools mirror the clearing result). No Stripe charge is ever reversed here — top-ups already landed as balance; only the internal reservation is released.

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

The stream orchestrator decides *when* challenges fire (randomized timing); the challenge engine decides *what* they are. See [challenge types](../product/content.md#randomized-attention-challenges).
