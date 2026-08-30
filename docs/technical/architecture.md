# Technical Architecture

## System overview

```text
                        ┌────────────────────────┐
                        │       BIG SCREEN       │
                        │                        │
                        │ Stream + leaderboard   │
                        │ QR + live stats        │
                        └───────────┬────────────┘
                                    │
                             WebSocket
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    STREAM ORCHESTRATOR                      │
│                                                             │
│ Queue manager                                               │
│ Segment scheduler                                           │
│ Stream continuity                                           │
│ Consumes sponsorship / auction results                      │
│ Attention challenge timing                                  │
└──────────────┬───────────────────────────┬──────────────────┘
               │              ▲            │
               │ generation   │ asset      │ API / events
               ▼              │            ▼
┌──────────────────────────┐  │   ┌───────────────────────────┐
│      DAYTONA POOL        │  │   │       BACKEND API         │
│                          │  │   │                           │
│ Disposable sandbox       │  │   │ Brand accounts            │
│                          │──┘   │ Stripe balances           │
│ LLM script               │      │ Listener sessions         │
│ TTS                      │      │ Reward ledger + accounting│
│ Image generation         │      │ Scraper ingestion         │
│ Video generation         │      │ Challenge generation      │
│                          │      │ Auction resolution        │
└──────────────────────────┘      └──────┬─────────────┬──────┘
                                         │             │
                          proves facts   │             │ moves dollars
                                         ▼             ▼
                    ┌─────────────────────────┐  ┌──────────────────┐
                    │        MIDNIGHT         │  │      STRIPE      │
                    │                         │  │                  │
                    │ ProofOfAttention        │  │ Brand top-ups    │
                    │ BidClearing             │  │ Real money rail  │
                    │ RewardClearing          │  │                  │
                    │ PreviewRightsThreshold  │  │                  │
                    └─────────────────────────┘  └──────────────────┘
```

The backend is the only component that talks to Midnight and Stripe: **Stripe moves dollars, Midnight proves facts** (see [money architecture](backend.md#money-architecture)), and the backend updates its ledger from both. The orchestrator drives the live experience and hands the backend the events it needs to clear bids; it does not settle money itself.

## Live transport architecture

Slopstream uses a **hybrid transport model**: HTTP is the authoritative command and snapshot plane; WebSockets are a low-latency projection of live state. A socket is never the source of truth for money, bids, proofs, or rewards.

| Plane           | Transport    | Responsibility                                                             | Examples                                                                                               |
| --------------- | ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Commands        | HTTPS / REST | Authenticated, validated, idempotent state changes                         | create listener session, place bid, top up, submit attention proof                                     |
| State           | HTTPS / REST | Authoritative initial load and recovery after a missed event or reconnect  | `GET /stream/snapshot`, brand balance/campaign state, listener receipt/balance                         |
| Live projection | WebSocket    | Server → client updates after state is persisted or stream runtime changes | leaderboard, OUTBID, generation progress, now playing, public challenge, aggregate attention, clearing |

A typical listener flow is: generate one browser-local commitment, create or resume a bearer session through the API, fetch the current stream snapshot, connect to the socket, then render subsequent events. The API binds that commitment to the issued session and requires both on proof submission. A challenge response is posted to the API; the API persists it, routes it through the verifier, and only then causes an aggregate `attention.verified` event to reach the screen. Browser clients do not send marketplace mutations as ad-hoc WebSocket events.

The gateway currently fans out only the **public** `WsEvent` stream: now playing, leaderboard, aggregate stats, generation, public challenges, and clearing animations. Listener proof receipts/balances and brand balances/campaign state remain on authenticated HTTPS responses and snapshots for the hackathon; they are never placed in the public live feed.

If a later release adds private socket updates, it must define a separately scoped event type and authenticate the target listener session or brand account. Do not reuse a public `WsEvent` by adding private fields. The detailed event, audience, and recovery contract is in [backend](backend.md#live-event-contract).

## Stream scheduling (product direction)

**Today (hackathon implementation).** Segment existence is tied to auction close: when a slot's auction closes, the API realizes a segment (paid winner or free scraped filler) and the orchestrator drives generating → ready → playing. If an auction fails to close, the pipeline can stall — we added overdue sweeps and demo seeding to mitigate that, but the coupling remains.

**Target (phase 1 product).** Decouple playback from auctions:

```text
CONTINUOUS QUEUE (always running)
  ├─ generating: next free Continuum segment
  ├─ ready: buffer for seamless handoff
  └─ playing: current beat on the big screen

SPONSORSHIP LAYER (optional overlay)
  └─ auction / bid assigns WHO funds the next beat, tier, and brief —
     not WHETHER a beat exists
```

The orchestrator keeps segments generating or ready ahead of playback with an **adaptive prefetch depth**: an EWMA of measured generation latency sets the buffer to `ceil(ewma / segmentPlaySec)`, clamped to 1–3, so slow generators automatically get a deeper queue. Full decoupling is the next architectural step.

**What plays while a sponsored segment generates.** Generation takes real wall-clock time, and the stream must never go silent. Free Continuum segments play through the queue while a winning bid's segment generates in the background. If the queue still runs dry, the scheduler falls back to **encores** — replays of recently aired segments, selected least-recently-played with a brand-variety penalty, gated off while the market is hot, and cut the instant a real segment is ready. Encores run entirely in the orchestrator: they broadcast a self-contained `segment.encore` event, open no clearing window, fire no challenges, and never touch the ledger. The quiet brand-name generation state is anticipation, not dead air.

## Component responsibilities

- **Big screen** — Continuum playback, archive world, QR join. Market chrome is secondary; theater mode hides it for content-first demos. Consumes WebSocket events.
- **Stream orchestrator** — the live brain: continuous segment queue, scheduler, stream continuity (The Continuum), attention challenge timing, and local ops metrics (`GET /ops/metrics`). Consumes auction/sponsorship results from the backend for paid beats — it never resolves auctions or settles money; the ledger is the single source of truth for both.
- **Daytona pool** — disposable sandboxes for ad generation (LLM script, TTS, image generation, video generation); returns the generated asset to the orchestrator.
- **Backend API** — brand accounts, Stripe balances, listener sessions, reward ledger and accounting, scraper ingestion, challenge generation, auction resolution (winner selection and slot assignment). Owns all clearing and settlement, and is the sole caller of Midnight and Stripe.
- **Midnight** — proves conditions on-chain; consulted by the backend. See [contracts](contracts.md).
- **Stripe** — the only real-money rail; called by the backend. See [backend](backend.md#money-architecture).

## Generation pipeline

Ordinary generation is a queued worker job: it calls trusted media APIs and
publishes a durable asset. A **disposable Daytona sandbox** is an optional
execution path for premium jobs that need isolated compute, such as building
an interactive creative or running a heavyweight render toolchain. Daytona is
not required for normal audio, image or video generation.

```text
Brand brief
     │
     ▼
LLM script
     │
     ▼
TTS
     │
     ├──── low tier → audio
     │
     ▼
Image generation
     │
     ├──── mid tier → audio + image
     │
     ▼
Video generation/upscale
     │
     ▼
Top tier → video
```

Each generation receives:

- brand brief
- production tier
- previous 1–2 segment summaries (the Continuity continuity input)
- campaign constraints
- optional `continuityImageUrl` — the prior segment's hero frame, for image-first video continuity
- optional `marketContext` — phase 2+: auction pressure for market-aware scripts (not required for phase 1 Continuum quality)

The generator deterministically selects a **creative format** per segment
(FNV-1a hash of the segment ID — see [content.md](../product/content.md#creative-format-rotation)).
Image and video prompts enforce **product placement**: cinematic visuals with
**no readable generated text**; voiceover carries the script. The big screen
never duplicates the transcript as typography.

When Daytona is used, the sandbox is destroyed after its validated output is
published. This retains the isolation rationale for generated or
user-supplied executable creative code; simple provider API calls do not need
that extra boundary. See [interactive creative plan](interactive-creative.md).

**What plays while a sponsored segment generates.** See [stream scheduling (product direction)](#stream-scheduling-product-direction) above.

## Lane 1 development services

Until the Daytona pipeline and Compact contracts are wired, Lane 1 exposes two local HTTP services. Their request and result types live in [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts); use those types rather than recreating JSON shapes in another lane.

| Service        | Run command          | Default URL             | Purpose                                                                   |
| -------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Proof verifier | `pnpm dev:verifier`  | `http://localhost:4100` | Lane 2 calls it server-to-server to validate a submitted attention proof. |
| Generator      | `pnpm dev:generator` | `http://localhost:4300` | Lane 3 calls it to request a generated segment.                           |

### JSON-stub proof verifier

- `GET /health` returns service health plus `verifierMode: "stub"`.
- `POST /v1/attention-proofs/verify` accepts an `AttentionProofVerificationRequest` and returns an `AttentionProofVerificationResult`.
- Only the API calls this endpoint. The browser submits its answer to Lane 2; Lane 2 authenticates the listener, keeps the complete challenge/answer private, and controls ledger writes and settlement.

**Lane 2 integration sequence:**

1. Receive the browser answer and validate it against Lane 2's private `Challenge`.
2. For a correct answer only, call `createServerStubAttentionProof()` from `@slopstream/shared` with a fresh nonce, `issuedAt`, listener commitment, segment ID, and challenge ID. Assign its return value to `submission.resultProof`.
3. Send `{ submission, context }` to the verifier. `context` must include `segmentStartedAt`, `submittedAt`, and `{ id, segmentId, validFrom, validUntil }` for the challenge.
4. Persist the `AttentionProofVerificationResult`; only a `verified: true` result may create a valid attention event. Return its `verifierMode` in the private receipt so the UI can label the receipt truthfully.

The verifier checks that the server-issued stub payload matches the listener/segment/challenge bindings, that issue and submission timestamps fall in the challenge window, and that its nonce has not been used in the current process. `VERIFIER_API_TOKEN` optionally requires a matching bearer credential from Lane 2; malformed requests return `400`, unauthenticated protected calls return `401`, and a well-formed but invalid proof returns `200` with `verified: false`.

**Security boundary:** `createServerStubAttentionProof()` is a deterministic demo attestation, not a cryptographic signature. It must run only after Lane 2 has checked a private answer, and it must never authorize a production clearing decision or payout. Process restarts clear the in-memory replay set. `VERIFIER_MODE=midnight` deliberately fails at startup until a real Midnight implementation exists, so a JSON verifier can never be mislabeled as Midnight.

### Stub generator

- `GET /health` returns service health.
- `POST /v1/generations` accepts a `GenerationRequest`; it returns `201` for a new canonical segment, `200` for an identical retry, `409` when that segment ID is reused with different inputs, and `400` for malformed input.
- Lane 2 allocates the canonical segment ID when it realizes an auction winner. The orchestrator sends that ID as the required `GenerationRequest.segmentId`; the generator echoes it unchanged in `GenerationResult.segmentId`. It never mints a competing stream segment ID.
- This same rule applies to a free segment: its authoritative owner allocates the ID before calling the generator. The result carries a tier-appropriate placeholder asset URL, transcript, continuity summary, and optional audio/visual metadata. Lane 3 queues the result; Lane 2 consumes the transcript to pre-generate challenges.
- `GENERATOR_MODE=stub` makes no provider calls. `GenerationProvider` and
  `GenerationJobStore` isolate the deterministic local implementation from a
  future Daytona/provider and durable job store. A future Daytona
  implementation replaces the provider internals while retaining this HTTP
  boundary and segment correlation rule.
- `SegmentPreparationService` is the tested Lane 3 handoff for a closed
  auction winner: it marks the segment generating, calls the generator,
  validates the returned ID, persists `ready`, posts transcript/metadata to
  `challenge-source`, and marks the segment failed if preparation cannot
  complete. The scheduler decides when to call it.

## Tech stack

| Layer            | Technology                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend         | Next.js                                                                                                                                                      |
| Screen rendering | HTML media + CSS Continuum field — central portal, archive cards, typography, spheres and event ripples (see [design language](../product/design-language.md)) |
| Optional 3D experiments | Retained R3F / Rapier prototype; not required by the shipped screen                                                                                   |
| Optional material effects | Retained post-processing and metaball experiments; progressive enhancement only                                                                       |
| 2D animation     | Framer Motion — spring physics for listener + brand surfaces and the floating HUD overlay                                                                    |
| Audio reactivity | Web Audio API `AnalyserNode` → subtle CSS/DOM motion, portal treatment and listener visuals                                                                  |
| Live transport   | HTTPS / REST commands + WebSocket projections                                                                                                                |
| Backend          | Node + TypeScript                                                                                                                                            |
| Queue            | Redis                                                                                                                                                        |
| Database         | Postgres                                                                                                                                                     |
| Generation       | Model-driven generation pipeline                                                                                                                             |
| Optional sandboxing | Daytona — only for generated/user-supplied executable creative work or heavyweight disposable renders                                                     |
| Contracts        | Compact / Midnight (Compact is Midnight's smart-contract language; Midnight is a privacy-preserving blockchain with private state and zero-knowledge proofs) |
| Payments         | Stripe                                                                                                                                                       |
| Audio            | TTS                                                                                                                                                          |
| Visuals          | Image generation                                                                                                                                             |
| Premium          | Video generation                                                                                                                                             |
| Listener client  | Mobile web / QR                                                                                                                                              |
| Authentication   | Lightweight session identity (listener); email/OAuth for brand console                                                                                       |

**Authentication scope.** Listeners join via QR with a lightweight, anonymous bearer session — no account needed — and the browser stores its token plus commitment in `sessionStorage`. The brand console moves real money (Stripe top-ups, bids), so production requires a stronger identity (email/OAuth). The local hackathon profile is an intentional exception: it seeds ACME with `DEMO_ACME_BRAND_TOKEN`, exposed as `NEXT_PUBLIC_DEMO_BRAND_TOKEN` only for a deterministic demo. That token is not production authentication. Full KYC is explicitly out of scope (see [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance)).

**Current-state caveat.** The table above is the target stack. For the hackathon, two rows are not yet real: the **Database** is an in-memory `Map` store shaped like the Postgres schema (`DATABASE_URL` is decorative; no migrations), and the **Queue** (Redis) is an in-process pub/sub fallback unless `REDIS_URL` is set. See [backend ledger](backend.md#backend-ledger) and [progress](../hackathon/progress.md). The shipped big screen is the HTML/CSS Continuum media world with Framer Motion overlays; the 3D rows are retained prototype experiments.
