# ClickHouse Track Plan

## Why ClickHouse is the right partner track

Slopstream is already an event-heavy live media workflow: the stream emits `segment.generating`, `segment.playing`, `bid.placed`, `bid.outbid`, `attention.verified`, `reward.pool.updated`, and `bid.cleared` events every few seconds. These events are:

- timestamped,
- high cardinality (per segment, per brand, per listener),
- time-series shaped,
- and drive every visible surface (leaderboard, attention threshold, listener rewards, cleared volume).

That maps directly to ClickHouse's strengths: fast append, columnar analytics, and real-time materialized views on a high-volume event stream.

## Core pitch for the hackathon

**Agentic media production + real-time attention marketplace analytics.**

A Gemini-powered agent (via Google Cloud Agent Builder) reads the live auction, brief, and scraped company context, then directs the creative pipeline (script, voice, image/video) and the clearing workflow. Every step of that pipeline — and every listener proof — is written to ClickHouse Cloud. The big screen, brand console, and listener phone query ClickHouse for real-time leaderboard, attention thresholds, and reward calculations.

This is a media & entertainment workflow (live AI-generated ad stream) with a credible, specific enterprise data/analytics story.

## What already fits

- `apps/orchestrator` runs a deterministic multi-step pipeline: auction poll → segment generation → challenge fire → window close → clearing.
- `apps/api` already has a typed `WsEvent` bus and ledger concepts (`Ledger`, `bid.cleared`, `reward.pool.updated`).
- `apps/web` already renders live stats, leaderboards, attention thresholds, and reward counters.
- Midnight `ProofOfAttention` contracts provide a privacy/proof differentiator that the ClickHouse track can highlight without replacing.

## Gaps to close for a valid submission

1. **Google Cloud + Gemini runtime usage**
   - Add `@google-cloud/aiplatform` or `@google/generative-ai` calls.
   - Use Gemini (and optionally Veo/Imagen) for at least one real generation step: script writing, image/video generation, or challenge design.
   - Host the generator or orchestrator on Google Cloud (Cloud Run / GCE / Agent Builder).

2. **ClickHouse Cloud runtime usage**
   - Add an official ClickHouse client (`@clickhouse/client`) in `apps/api` and/or `apps/orchestrator`.
   - Create event tables (`events`, `attention_proofs`, `bids`, `rewards`) and insert real rows at runtime.
   - Replace in-memory leaderboard/attention stats queries with ClickHouse `SELECT`s.
   - Keep the in-memory `Ledger` for fast settlement/locking only; make ClickHouse the source of truth for analytics and public screen state.

3. **One partner track only**
   - Choose **ClickHouse** as the submission track.
   - The existing Parallel Search scraper can stay as a cold-start data source, but it cannot be the primary partner integration.

4. **Submission requirements**
   - Add a public `LICENSE` file.
   - Deploy a hosted version.
   - Record the 3-minute demo video in English.
   - Open-source the repo.

## Suggested architecture change

```text
[Orchestrator] --WsEvent--> [API] --INSERT--> [ClickHouse Cloud]
                                |
                                +---> [Ledger] (settlement locks)
                                |
[Web] <---SELECT--- [ClickHouse Cloud] (leaderboard, stats, rewards)
```

- The API becomes the authoritative event writer.
- ClickHouse becomes the read model for the public screens.
- The Gemini agent step lives inside `apps/generator` (creative) or a new `apps/agent` service that produces the brief/script and writes intent to ClickHouse.

## Minimum viable hackathon scope

1. ClickHouse Cloud cluster + service account.
2. One table: `events` with columns `(event_id, type, segment_id, brand_id, listener_id, amount_usd, ts)`.
3. Insert every `WsEvent` from `apps/api/src/bus.ts`.
4. Query `events` for:
   - leaderboard (`bid.placed`/`bid.outbid` latest per slot),
   - verified attention count per segment,
   - total cleared volume.
5. Gemini generation step: use `gemini-1.5-pro` or `gemini-2.0-flash` to write the ad script from the brand brief and scraped company context, replacing the current template/fallback chain.
6. Deploy generator + API to Google Cloud Run.

## Risk / honest caveat

Today the `Ledger` is in-memory and the repo has no ClickHouse, Gemini, or Google Cloud SDK imports. This pivot is a strong idea, but it is still a pivot — not a ready-made submission.

## Decision

**ClickHouse track is a better long-term fit than Parallel** because the product is an event-driven analytics surface wrapped around a live media stream. Keep Parallel Search as a nice cold-start source, but submit under ClickHouse and build the ClickHouse + Gemini integration over the next week.
