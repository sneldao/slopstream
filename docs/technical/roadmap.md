# Long-Term Slopstream Roadmap

> Post-demo plan. The goal is to move Slopstream from a working hackathon demo
> to a stream that is alive forever for ~$0/day, then to a real attention
> marketplace — without adding features that dilute the core loop.
>
> Canonical cold-start strategy: [Evergreen Loop](../product/evergreen-loop.md).
> That document owns the _what and why_; this one tracks _build phases_.

## Core product loop (do not dilute)

1. **Stream** airs segments from the durable catalog on rotation.
2. **Listener** opts in, watches, and answers attention checks.
3. **Market** verifies attention and rewards listeners (testnet token first,
   real rails later).
4. **Advertiser** (Stage 3+) stakes for boosted rotation.

The auction is hibernating until two advertisers compete for the same slot.
Slots are rotation positions, not auction windows.

---

## Phase 0 — Operational safety (now)

Make the backend safe to leave running unattended. Largely superseded by the
Evergreen Loop posture (generator/scraper off, loop from catalog), but the
guardrails still apply.

1. **Kill switch / pause mode** — DONE (`STREAM_ENABLED`, `/ops/pause`,
   `/ops/resume`; default paused until a frontend connects).
2. **Idle / dead-air backoff** — DONE (exponential poll backoff to
   `MAX_IDLE_POLL_MS`; encore ring covers gaps with `MIN_ENCORE_INTERVAL_MS`).
3. **Cost caps** — OPEN
   - `MAX_DAILY_GENERATION_COST` and `MAX_CONCURRENT_GENERATIONS`.
   - Default to `stub` mode for unattended deployments.
   - Require explicit `ELEVENLABS_ENABLED=true` (and a budget) before paid calls.
4. **Better health checks** — OPEN
   - `/health/live` fails when `stream.idle` fires or CPU spins with no playback.
   - Coolify/Docker can restart or notify instead of silently burning cycles.

**Outcome:** Deploy, demo, and forget — no VPS burn, no API bills.

---

## Phase 1 — Evergreen Loop (current build focus)

The stream runs forever off a durable, curated segment catalog. See
[evergreen-loop.md](../product/evergreen-loop.md) for strategy.

1. **Durable segment catalog** (the unblock)
   - Persist finished segments (media manifest + transcript + challenges +
     rotation weight) to SQLite/disk; reseed on boot.
   - Segments must survive API restarts; the in-memory `Ledger` wipe is the
     thing being fixed. Balances come later (Phase 2).
   - Lift or rework the `recentSegments` 30-min / 8-item cap so the catalog,
     not a rolling window, is the source of rotation candidates.
2. **Rotation engine**
   - Promote the encore path (`pickEncoreCandidate`) from gap-cover to primary
     scheduler: weighted rotation, variety penalty, boost decay (`weightUntil`)
     for new entries.
   - Target 10–15 curated segments, 15–20s playback, shuffle/weighted order.
3. **One-time generation session**
   - Single ElevenLabs run (audio + image tiers first; video sparingly) to
     mint the catalog. Curate keepers, delete duds.
   - Content policy applies from the first minted segment (parody label, no
     defamation, NSFW screen) — see evergreen-loop.md.
4. **Generator-off runbook**
   - Deployment posture: `GENERATOR_MODE=stub`, scraper off,
     `STREAM_ENABLED=true`. Document exact Coolify env in deployment.md.

**Outcome:** A public URL that never looks dead and costs $0/day. No tokens,
no advertisers needed — but ready for both.

---

## Phase 2 — Testnet $SLOPSTREAM rewards

Turn viewers into users with a real-but-worthless incentive.

> Decision (2026-09-16): **Midnight preprod, not EVM.** Pure EVM is
> faster tooling-wise but scores 0 on the 40% Engineering gate and
> risks a "not Midnight-related" ruling for Wave 2. Full spec:
> [wave2-task0004-rewards.md](../hackathon/wave2-task0004-rewards.md).

1. **Token deploy** — `$SLOPSTREAM` claim accounting via a new
   `RewardClearing.compact` on Midnight preprod (custodial points
   first, on-chain claim receipts on drip).
2. **Custodial accrual first** — API tracks `pendingTokenRewards`, faucet
   drips on payout request. On-chain per-proof distribution later.
3. **Durable balances** — SQLite minimum; restarts must not zero wallets.
4. **Anti-Sybil minimum** — per-browser session persistence, rate limits,
   nullifier replay protection, threshold fraction. Non-trivial, not perfect.
5. **Framing** — points-with-a-ledger (status, slots), never money. No USD
   value promises.

**Outcome:** Watching earns something real enough to return for, cheap enough
to leave running.

---

## Phase 3 — Advertiser staking (on demand, not on schedule)

Only when a real advertiser knocks. Manual onboarding: docs/links → NSFW
screen → we craft the segment → boosted rotation.

1. **Rotation weight as ad product** — `weightUntil` boost, then decay to the
   long tail unless re-staked.
2. **Stake-to-attention flow** — advertiser buys `$SLOPSTREAM`, stakes for a
   slot, stake streams to provers. Start with pool-address watching; on-chain
   escrow later.
3. **Aggregate-only analytics** — counts + ZK proofs by default; voluntarily
   shared listener fields as opt-in upgrade. Never raw per-session linkage
   (see evergreen-loop.md privacy boundary).
4. **Real verifier (Midnight)** — replace stub proofs with the real
   `apps/verifier` flow as staking value grows.
5. **Real money rails** — Stripe Connect for top-ups/payouts when advertisers
   pay fiat; keep mock paths behind `NODE_ENV=development` only.

**Outcome:** The loop pays for itself; advertisers fund attention.

---

## Phase 3b — Partner airtime and the metered broadcast API

Conceived 2026-10-20. The inbound half of the agent channel described in
[product/overview.md](../product/overview.md): other platforms — AI video tools,
generators, agentic creators — hand us the videos their users make, and we air
them rotation-curated like a TV station. A partner feed is not a new pipeline.
It is a second **author** of the same catalog artifact `mint-evergreen`
produces today, so the whole build is ingest + trust boundaries.

The same object answers the stream's real weakness: the catalog is 12 entries,
all of them ours.

### What already exists, and what has to be built

| Capability                    | Today                                                                                                                                         | Partner airtime needs                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Segment definition            | `mint-evergreen` writes the exact entry shape (`id version brandId tier durationSec transcript summary brief media{key,contentType,…} style`) | Accept the same shape from an outside caller. Zero schema invention                                                          |
| Media integrity               | content-addressed R2/`/assets` keys; the API verifies declared SHA-256 against the bytes and fails closed at boot                             | Fetch-once-then-mirror through the `apps/asset-uploader` Worker; the airable object is the digest, never the submitter's URL |
| Dedupe                        | content-addressed keys collapse identical bytes                                                                                               | Free                                                                                                                         |
| Rotation                      | `pickNextEvergreen`: `weight/(1+airCount)`, `weightUntil` boost decay, variety penalties on brand **and style**                               | Partner = brand axis. A per-partner share cap is config, not code                                                            |
| Boosted rotation as a product | `weightUntil`                                                                                                                                 | Already Phase 3                                                                                                              |
| Challenges                    | `AppChallenge` carries the answer and is backend-only; the public variant omits it and binds `opensAfterSeconds` / `expiresAfterSeconds`      | **Submitters never author challenges.** We generate them from the transcript                                                 |
| Playout length                | scheduler clamps the window to manifest duration                                                                                              | Enforce a duration ceiling at ingest                                                                                         |
| Boot validation               | `evergreenValidate.ts`, fail closed                                                                                                           | Must be strictly _stronger_ at ingest — see the restart vector below                                                         |
| Catalog writability           | read at boot from `EVERGREEN_CATALOG_DIR`; the current image **bakes** it                                                                     | A writable catalog (volume or table) plus a rescan trigger. This is the first real build item                                |
| Metered machine reads         | `GET /air/now`, `/air/history`, `/air/receipt/:id` — free tier, IP-metered, whitelisted projection                                              | A price and a write: x402 settlement once a facilitator exists, plus `POST /air/claim`                                       |

### Three constraints that decide the design

1. **Boot validation is a restart vector.** The API fail-closes on a bad entry
   at boot. Anything that can write into the catalog can therefore crash-loop
   the stream. Ingest must run every boot check _before_ accepting, and a
   rejected submission must be indistinguishable to the loop from never having
   arrived. Without this, "platforms send us videos" is an availability
   vulnerability, not a feature.
2. **Ingest never touches settlement eligibility.** Partner segments air with
   `bidId: null`, exactly like evergreen today — nothing to clear. Attention
   proofs on partner slots are recorded, not paid. The moment partner content
   becomes earnable it needs signed provenance plus a human curation gate,
   because a submitter who authors both the transcript and the challenge owns
   the answer key.
3. **A channel that anyone can feed is a broadcaster.** Rights to publicly air
   someone else's user content, moderation, and takedown arrive the day the
   first partner video plays. `mint-evergreen` already refuses local and private
   media origins, so the network boundary exists; what does not exist is any
   moderation or takedown path.

### Logistics

- **Intake stays manual first** — a JSON POST to the API or a `mint` run over a
  submitted manifest, then a human (us) screens it. Self-serve is Phase 3+
  behaviour, and "self-serve advertiser UI" is already on the do-not-build list.
- **Rights representation per submission**: who owns it, are they licensed to
  publicly air it, is there a takedown contact. Not a checkbox — a stored field
  on the entry.
- **Quotas**: submissions/day per partner, bytes and duration ceiling, total
  partner share of the rotation.
- **Labeling**: the catalog `brief` prefix ("Unofficial AI-generated parody ad.
  Not affiliated with…") is a per-entry convention today, which means a
  submitter writes their own disclosure. That has to become server-controlled
  and derived from the source type before partner media airs — it is also the
  advertising-disclosure item already sitting in Phase 4.
- **Takedown**: delete entry + drop the rotation position + keep the tombstone,
  because historical attention proofs reference a slot that aired. Deleting
  history would break the receipts.
- **Review labor is the actual cost.** Provider spend stays near $0 because
  partner content arrives pre-rendered — no generation at all.

### Cost model — the "$0/day" claim needs a footnote here

Inbound media moves the meter from generation to storage and egress. Mirroring
every accepted video to R2 is a real, growing bill; R2's no-egress-fee model is
what makes airing it affordable, and the free allowance is a ceiling, not a
guarantee (same wording discipline as the free-tier guardrails in
[deployment.md](deployment.md)). Publish the review-time budget next to the
dollar budget — one human-hour per submission is the number that actually
scales badly.

### The metered read surface (x402) — gate the output, not the input

A payment gate prices demand, and the demand that exists today is machine reads,
not submissions: platforms will not pay to be aired to an audience that is us,
while an agent paying a few cents to learn what is on air, what its verified
attention profile is, or to claim a rotation window has a reason to exist now.

```text
GET  /air/now                 playing + recent + upcoming, structured fields only
GET  /air/history             aired slots + verified-attention counts
GET  /air/receipt/:segmentId  the attention proof a machine can re-verify
POST /air/claim               reserve a boosted window (writes weightUntil) — P1+
```

- Serve **structured, sanitized fields** — enum categories, numbers, short
  validated strings — never raw transcript or generated prose. Brand-authored
  text in an agent's context window is a prompt-injection payload; same rule as
  the agent channel in `docs/product/overview.md`.
- Agent reads never clear a bid or mint listener rewards, at any price.
- The x402 protocol (402 + `PAYMENT-REQUIRED`, facilitator verify/settle) has no
  Midnight implementation. **P0 is the shape, not the settlement**: a free
  metered tier behind a header contract we control, so turning on a real rail
  later is a swap and not a redesign. Do not describe it as paying agents until
  a facilitator exists.
- An agent that should not have to learn our routes gets the same data through
  `apps/api/src/mcpBroadcast.ts` — three stdio MCP tools (`air_now`,
  `air_history`, `air_receipt`) over the `/air/*` reads. It is a thin bridge,
  hand-rolled instead of pulling in `@modelcontextprotocol/sdk` for four
  methods, and it **adds no fields**: the projection is the injection boundary,
  so the MCP layer cannot leak what the HTTP layer already refuses to send.
  `SLOPSTREAM_API_URL` points it at a deployment.
- The orchestrator gateway is the right host for a paid surface — it already
  owns CORS and the browser-facing market. P0 shipped on Lane 2 anyway, because
  the gateway reverse-proxies every unlisted path: `/air/*` reaches clients
  through the same origin with no gateway change, and no price on it yet.
  Renaming or versioning (`/v1/*`) is a gateway alias for P4, not a rewrite.

### Phasing

|     | Deliverable                                                                                            | Effort                | Gate to start                            |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------- |
| P0  | **Shipped 2026-10-20** — metered on-air read API (`airApi.ts`, free tier, no x402 body until a rail exists) + stdio MCP bridge (`mcpBroadcast.ts`) | 1–2 days              | nothing — demoable this wave             |
| P1  | writable catalog path + rescan trigger; ingest endpoint; ingest-time mirror + validation-before-accept | 2–4 days              | Phase 1 catalog work landed              |
| P2  | partner intake: rights fields, quotas, tombstones, server-controlled labeling, one pilot partner       | days, not weeks       | a named partner with lawful media        |
| P3  | provenance-signed entries + curation gate → earnable partner slots                                     | new circuit           | Phase 2 + first abuse attempt understood |
| P4  | real x402 settlement + boosted-window purchase as the product                                          | facilitator-dependent | a rail to settle on                      |

**Outcome:** supply-side content diversity for near-zero provider cost, plus a
machine-readable surface that is the honest first product — _verified broadcast
signal priced in machine money_ — which is also the line Midnight's own
"autonomous economic agents / machine-to-machine commerce" category is asking
for.

---

## Phase 4 — Scale, trust, and operations

Only after Phases 1–3 are solid.

1. **Partner tracks** — ClickHouse Cloud event sink + Gemini/Agent Builder
   generation (see `docs/hackathon/clickhouse-track-plan.md`). Valid
   submission paths and real analytics as a side effect.
2. **Deployment** — R2/S3-backed asset storage instead of local disk;
   Cloud Run / GCE for agentic pipeline if needed.
3. **Trust & safety** — content moderation tooling, hardened takedown,
   rate limits, duplicate-account detection.
4. **Observability** — Prometheus metrics (already at `GET /metrics`);
   alerting on `stream.idle`, failed generations, spend.
5. **Legal & compliance** — `LICENSE`, privacy policy, advertising disclosure
   for AI-generated ads.

---

## What _not_ to build

- **Live auction resurrection**: hibernates until advertiser competition demands it.
- **Self-serve advertiser UI**: manual curation is the quality filter while small.
- **More demo pages / surfaces**: the three existing surfaces (`/`, `/listen`, `/brand`) already cover the loop. Polish them instead of adding more.
- **3D overhaul or visual extravagance**: the current Continuum is demoable; make it reliable before making it prettier.

---

## Suggested execution order

1. **Phase 1 now** — durable catalog is the single unblock; everything else queues behind it.
2. **Phase 2 next** — token turns the alive URL into a growing one.
3. **Phase 3 on demand** — a real advertiser is the trigger, not a date.
4. **Phase 3b P0 alongside Phase 1** — the metered on-air read API needs no catalog write access, so it is the one piece of the partner track that can ship during the hackathon. Everything above P0 waits for a partner who can answer for the media they send.
5. **Phase 4 when funded** — scale work follows revenue, not anticipation.
