# Long-Term Slopstream Roadmap

> Post-demo plan. The goal is to move Slopstream from a working hackathon demo
> to a stream that is alive forever for ~$0/day, then to a real attention
> marketplace — without adding features that dilute the core loop.
>
> Canonical cold-start strategy: [Evergreen Loop](../product/evergreen-loop.md).
> That document owns the *what and why*; this one tracks *build phases*.

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

## What *not* to build

- **Live auction resurrection**: hibernates until advertiser competition demands it.
- **Self-serve advertiser UI**: manual curation is the quality filter while small.
- **More demo pages / surfaces**: the three existing surfaces (`/`, `/listen`, `/brand`) already cover the loop. Polish them instead of adding more.
- **3D overhaul or visual extravagance**: the current Continuum is demoable; make it reliable before making it prettier.

---

## Suggested execution order

1. **Phase 1 now** — durable catalog is the single unblock; everything else queues behind it.
2. **Phase 2 next** — token turns the alive URL into a growing one.
3. **Phase 3 on demand** — a real advertiser is the trigger, not a date.
4. **Phase 4 when funded** — scale work follows revenue, not anticipation.
