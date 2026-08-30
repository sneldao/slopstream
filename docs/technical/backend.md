# Backend: Money Architecture, Ledger, and Challenge Engine

## Money architecture

**Stripe remains the only real-money rail.** This is important.

```
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

```
gross_amount        = $10.00
listener_percentage = 80%
platform_percentage = 20%

listener_pool       = $8.00
platform_revenue    = $2.00
```

Listener rewards start as an **internal balance** — payout rails are a later feature. See [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance).

## Attention challenge engine

The backend maintains a challenge queue.

```
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

For the demo, **pre-generate challenges from the script/transcript** rather than trying to create them synchronously during playback.

The stream orchestrator decides *when* challenges fire (randomized timing); the challenge engine decides *what* they are. See [challenge types](../product/content.md#randomized-attention-challenges).
