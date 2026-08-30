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

A typical listener flow is: create or resume a session through the API, fetch the current stream snapshot, connect to the socket, then render subsequent events. A challenge response is posted to the API; the API persists it, routes it through the verifier, and only then causes an aggregate `attention.verified` event to reach the screen. Browser clients do not send marketplace mutations as ad-hoc WebSocket events.

The gateway currently fans out only the **public** `WsEvent` stream: now playing, leaderboard, aggregate stats, generation, public challenges, and clearing animations. Listener proof receipts/balances and brand balances/campaign state remain on authenticated HTTPS responses and snapshots for the hackathon; they are never placed in the public live feed.

If a later release adds private socket updates, it must define a separately scoped event type and authenticate the target listener session or brand account. Do not reuse a public `WsEvent` by adding private fields. The detailed event, audience, and recovery contract is in [backend](backend.md#live-event-contract).

## Component responsibilities

- **Big screen** — stream playback, live leaderboard, QR code, live stats. Consumes WebSocket events.
- **Stream orchestrator** — the live brain: queue manager, segment scheduler, stream continuity (Infinite Slop), attention challenge timing. Consumes auction results from the backend — it never resolves auctions or settles money; the ledger is the single source of truth for both.
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
- previous 1–2 segment summaries (the Infinite Slop continuity input)
- campaign constraints

The sandbox is then destroyed. This retains the isolation rationale: brand-submitted prompts are untrusted input, so generation runs should not share mutable state.

**What plays while the winner generates.** Generation takes real wall-clock time, and the stream must never go silent. The segment scheduler keeps playing queued segments — typically free Infinite Slop filler ads — while the winning bid's segment generates in the background. When `segment.ready` fires, the generated segment cuts into the stream at the next segment boundary. This is also why the free-ad queue is load-bearing, not just a cold-start nicety: it is the filler that keeps the stream alive between paid slots. The `GENERATING AD...` stage checklist plays as an overlay/preview, not as dead air.

## Lane 1 development services

Until the Daytona pipeline and Compact contracts are wired, Lane 1 exposes two local HTTP services. Their request and result types live in [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts); use those types rather than recreating JSON shapes in another lane.

| Service        | Run command          | Default URL             | Purpose                                                                   |
| -------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Proof verifier | `pnpm dev:verifier`  | `http://localhost:4100` | Lane 2 calls it server-to-server to validate a submitted attention proof. |
| Generator      | `pnpm dev:generator` | `http://localhost:4300` | Lane 3 calls it to request a generated segment.                           |

### JSON-stub proof verifier

- `GET /health` returns service health.
- `POST /v1/attention-proofs/verify` accepts an `AttentionProofVerificationRequest` and returns an `AttentionProofVerificationResult`.
- The API, not the browser, calls this endpoint. Lane 2 authenticates the listener, owns the full challenge (including the answer), supplies the timing/binding context, persists the outcome, then emits any aggregate marketplace event.
- The stub expects `submission.resultProof` to be a JSON-encoded `StubAttentionProofPayload`. It checks listener/segment/challenge binding, that issue and submission timestamps fall in the challenge window, and rejects a reused nonce for the life of its process. A well-formed but invalid proof returns `200` with `verified: false`; malformed requests return `400`.

**Security boundary:** the stub payload's `valid` flag is self-reported. It is a deterministic demo/integration harness, **not cryptographic verification**, and must never authorize a production clearing decision or real payout. Process restarts also clear its in-memory replay set. Replacing the stub with the Midnight verifier must preserve the shared request/result contract while removing those assumptions.

### Stub generator

- `GET /health` returns service health.
- `POST /v1/generations` accepts a `GenerationRequest` and returns a `201` `GenerationResult`; malformed requests return `400`.
- The result includes a fresh stub `segmentId`, tier-appropriate placeholder asset URL, transcript, continuity summary, and optional audio/visual metadata. Lane 3 queues the result; Lane 2 consumes the transcript to pre-generate challenges.
- `GENERATOR_MODE=stub` makes no provider calls. A future Daytona implementation replaces the internals of `generate()` while retaining this HTTP boundary and shared types.

## Tech stack

| Layer           | Technology                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend        | Next.js                                                                                                                                                      |
| Live transport  | HTTPS / REST commands + WebSocket projections                                                                                                                |
| Backend         | Node + TypeScript                                                                                                                                            |
| Queue           | Redis                                                                                                                                                        |
| Database        | Postgres                                                                                                                                                     |
| Generation      | Model-driven generation pipeline                                                                                                                             |
| Sandboxing      | Daytona (disposable cloud dev sandboxes — each generation run gets a fresh, isolated environment that's destroyed after)                                     |
| Contracts       | Compact / Midnight (Compact is Midnight's smart-contract language; Midnight is a privacy-preserving blockchain with private state and zero-knowledge proofs) |
| Payments        | Stripe                                                                                                                                                       |
| Audio           | TTS                                                                                                                                                          |
| Visuals         | Image generation                                                                                                                                             |
| Premium         | Video generation                                                                                                                                             |
| Listener client | Mobile web / QR                                                                                                                                              |
| Authentication  | Lightweight session identity (listener); email/OAuth for brand console                                                                                       |

**Authentication scope.** Listeners join via QR with a lightweight, anonymous session — no account needed. The brand console moves real money (Stripe top-ups, bids), so it requires a stronger identity (email/OAuth). For the hackathon, brand auth can be a simple email magic link; full KYC is explicitly out of scope (see [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance)).
