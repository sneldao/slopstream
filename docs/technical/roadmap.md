# Long-Term Slopstream Roadmap

> Post-demo plan. The goal is to move Slopstream from a working hackathon demo to a safe, demoable, and eventually production-grade attention marketplace — without adding features that dilute the core three-role loop.

## Core product loop (do not dilute)

1. **Brand** bids for the next slot.
2. **AI** generates the ad.
3. **Listener** opt-in, watches, and answers an attention check.
4. **Market** clears the bid and pays listeners.

Everything below serves that loop.

---

## Phase 0 — Operational safety (now)

Make the backend safe to leave running unattended. This is the immediate follow-up from the VPS dead-air loop.

1. **Kill switch / pause mode**
   - Add `STREAM_ENABLED` to orchestrator env.
   - Add `/ops/pause` and `/ops/resume` endpoints (orchestrator token) that stop/resume the scheduler, marketplace feed, and scraper.
   - Default to `STREAM_ENABLED=false` in demo deployments until a frontend connects.

2. **Idle / dead-air backoff**
   - When `nowPlaying` is null and `upcoming` is empty for > 30s, increase poll interval from 1s to 10–30s.
   - Stop the encore replay chain from firing repeatedly; replay one encored segment and then wait for the next poll cycle.
   - Cap encore play count per minute.

3. **Cost caps**
   - `MAX_DAILY_GENERATION_COST` and `MAX_CONCURRENT_GENERATIONS` in the generator.
   - Default to `stub` mode for unattended deployments.
   - Require explicit `ELEVENLABS_ENABLED=true` (and a budget) before any paid provider is called.

4. **Better health checks**
   - `/health/live` on the orchestrator fails when `stream.idle` fires or CPU is spinning with no playback.
   - Coolify/Docker can restart or notify instead of silently burning cycles.

**Outcome:** You can deploy the backend, show the demo, and forget about it without it eating VPS CPU or racking up API bills.

---

## Phase 1 — Product foundation

Move from in-memory demo data to a real-enough architecture.

1. **Persistent ledger**
   - Wire `DATABASE_URL` to Postgres.
   - Replace in-memory `Ledger` maps with the existing schema in `apps/api/src/ledger.ts` + migrations.
   - Ledger must survive API restarts; balances, bids, and auction state must not reset.

2. **Durable generation queue**
   - Use `GENERATION_JOB_DB_PATH` (SQLite) or Postgres for generation job state.
   - The orchestrator enqueues; a worker completes; the orchestrator only plays `ready` jobs.
   - This removes the single-in-memory-job failure mode.

3. **Real verifier (Midnight)**
   - Replace stub verifier calls with the real `apps/verifier` flow.
   - Proof-of-attention becomes a real zero-knowledge proof, not a JSON stub.
   - Keep verifier private behind the API.

4. **Real money rails**
   - Stripe Connect for brand top-ups and listener payouts.
   - Keep the mock `POST /top-ups` path behind `NODE_ENV=development` only.
   - Add brand onboarding (campaign brief, colors) and listener wallet/identity.

**Outcome:** The product is no longer a demo; it is a real money/attention marketplace that can survive restarts and handle real transactions.

---

## Phase 2 — ClickHouse + Gemini (partner-track execution)

This is the hackathon-track pivot documented in `docs/hackathon/clickhouse-track-plan.md`.

1. **ClickHouse Cloud event sink**
   - Add `@clickhouse/client` to `apps/api`.
   - Ingest every `WsEvent` into ClickHouse: `bids`, `attention_proofs`, `rewards`, `segments`.
   - Make the web leaderboard, stats, and reward counters read from ClickHouse.

2. **Gemini / Google Cloud Agent Builder**
   - Replace the current template/script generation with Gemini for ad scripts.
   - Optional Veo/Imagen for image/video when budget allows.
   - Host the generator or a new `apps/agent` service on Google Cloud.

3. **Real-time analytics surface**
   - Live attention dashboards: verified view counts, cost per verified attention, brand ROI.
   - Materialized leaderboards from ClickHouse.

**Outcome:** A valid ClickHouse/Gemini hackathon submission and a real analytics/data platform as a side effect.

---

## Phase 3 — Scale, trust, and operations

Only after Phases 0–2 are solid.

1. **Deployment**
   - Cloud Run / GCE for the agentic pipeline.
   - Coolify or managed Kubernetes for the API, orchestrator, and verifier.
   - R2/S3-backed asset storage instead of local disk.

2. **Trust & safety**
   - Content moderation for scraped companies and submitted brand briefs.
   - Public opt-out/takedown endpoint (already exists; make it hardened).
   - Rate limits, anti-gaming, and duplicate-account detection.

3. **Observability**
   - Prometheus metrics (already exposed at `GET /metrics`).
   - Alerting on `stream.idle`, failed generations, and high spend.

4. **Legal & compliance**
   - Public `LICENSE`.
   - Privacy policy for listener data and attention proofs.
   - Advertising disclosure for AI-generated ads.

---

## What *not* to build

- **Public audience bidding / UGC ad pitch queue**: it confuses the B2B brand marketplace story. Keep the listener QR as the only audience interaction.
- **More demo pages / surfaces**: the three existing surfaces (`/`, `/listen`, `/brand`) already cover the loop. Polish them instead of adding more.
- **3D overhaul or visual extravagance**: the current Continuum is demoable; make it reliable before making it prettier.

---

## Suggested execution order

1. Start **Phase 0** immediately — it is small and stops the resource burn.
2. Parallelize **Phase 1** (Postgres ledger) and **Phase 2** (ClickHouse/Gemini) with one person each.
3. Only after the product is stable, move to **Phase 3**.
