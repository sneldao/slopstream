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
│ Consumes auction results                                    │
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

## Component responsibilities

- **Big screen** — stream playback, live leaderboard, QR code, live stats. Consumes WebSocket events.
- **Stream orchestrator** — the live brain: queue manager, segment scheduler, stream continuity (The Continuum), attention challenge timing. Consumes auction results from the backend — it never resolves auctions or settles money; the ledger is the single source of truth for both.
- **Daytona pool** — disposable sandboxes for ad generation (LLM script, TTS, image generation, video generation); returns the generated asset to the orchestrator.
- **Backend API** — brand accounts, Stripe balances, listener sessions, reward ledger and accounting, scraper ingestion, challenge generation, auction resolution (winner selection and slot assignment). Owns all clearing and settlement, and is the sole caller of Midnight and Stripe.
- **Midnight** — proves conditions on-chain; consulted by the backend. See [contracts](contracts.md).
- **Stripe** — the only real-money rail; called by the backend. See [backend](backend.md#money-architecture).

## Generation pipeline

Each segment is isolated in a **disposable Daytona sandbox**.

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
- previous 1–2 segment summaries (the Continuum continuity input)
- campaign constraints

The sandbox is then destroyed. This retains the isolation rationale: brand-submitted prompts are untrusted input, so generation runs should not share mutable state.

**What plays while the winner generates.** Generation takes real wall-clock time, and the stream must never go silent. The segment scheduler keeps playing queued segments — typically free Continuum filler ads — while the winning bid's segment generates in the background. When `segment.ready` fires, the generated segment cuts into the stream at the next segment boundary. This is also why the free-ad queue is load-bearing, not just a cold-start nicety: it is the filler that keeps the stream alive between paid slots. The `GENERATING AD...` stage checklist plays as an overlay/preview, not as dead air.

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
| 3D physics       | `@react-three/rapier` (WASM rigid-body physics) — brand blobs collide and spring                                                                             |
| Post-processing  | `@react-three/postprocessing` — bloom, depth of field, chromatic aberration                                                                                  |
| Fluid shader     | GLSL ray-marching SDF metaballs (primary) + mesh fallback with quality switch                                                                                |
| 2D animation     | Framer Motion — spring physics for listener + brand surfaces and the floating HUD overlay                                                                    |
| Audio reactivity | Web Audio API `AnalyserNode` → shader uniforms + physics forces                                                                                              |
| Live transport   | HTTPS / REST commands + WebSocket projections                                                                                                                |
| Backend          | Node + TypeScript                                                                                                                                            |
| Queue            | Redis                                                                                                                                                        |
| Database         | Postgres                                                                                                                                                     |
| Generation       | Model-driven generation pipeline                                                                                                                             |
| Sandboxing       | Daytona (disposable cloud dev sandboxes — each generation run gets a fresh, isolated environment that's destroyed after)                                     |
| Contracts        | Compact / Midnight (Compact is Midnight's smart-contract language; Midnight is a privacy-preserving blockchain with private state and zero-knowledge proofs) |
| Payments         | Stripe                                                                                                                                                       |
| Audio            | TTS                                                                                                                                                          |
| Visuals          | Image generation                                                                                                                                             |
| Premium          | Video generation                                                                                                                                             |
| Listener client  | Mobile web / QR                                                                                                                                              |
| Authentication   | Lightweight session identity (listener); email/OAuth for brand console                                                                                       |

**Authentication scope.** Listeners join via QR with a lightweight, anonymous bearer session — no account needed — and the browser stores its token plus commitment in `sessionStorage`. The brand console moves real money (Stripe top-ups, bids), so production requires a stronger identity (email/OAuth). The local hackathon profile is an intentional exception: it seeds ACME with `DEMO_ACME_BRAND_TOKEN`, exposed as `NEXT_PUBLIC_DEMO_BRAND_TOKEN` only for a deterministic demo. That token is not production authentication. Full KYC is explicitly out of scope (see [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance)).

**Current-state caveat.** The table above is the target stack. For the hackathon, two rows are not yet real: the **Database** is an in-memory `Map` store shaped like the Postgres schema (`DATABASE_URL` is decorative; no migrations), and the **Queue** (Redis) is an in-process pub/sub fallback unless `REDIS_URL` is set. See [backend ledger](backend.md#backend-ledger) and [progress](../hackathon/progress.md). The 3D-rendering / 3D-physics / post-processing rows describe the retained prototype; the shipped big screen is now the HTML/CSS Continuum media world with Framer Motion overlays (see [design language](../product/design-language.md)).
