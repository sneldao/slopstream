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
│ Bid selection                                               │
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

## Component responsibilities

- **Big screen** — stream playback, live leaderboard, QR code, live stats. Consumes WebSocket events.
- **Stream orchestrator** — the live brain: queue manager, segment scheduler, stream continuity (Infinite Slop), bid selection, attention challenge timing. Emits events; does not settle money.
- **Daytona pool** — disposable sandboxes for ad generation (LLM script, TTS, image generation, video generation); returns the generated asset to the orchestrator.
- **Backend API** — brand accounts, Stripe balances, listener sessions, reward ledger and accounting, scraper ingestion, challenge generation. Owns all clearing and settlement, and is the sole caller of Midnight and Stripe.
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

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js |
| Live updates | WebSockets |
| Backend | Node + TypeScript |
| Queue | Redis |
| Database | Postgres |
| Generation | Model-driven generation pipeline |
| Sandboxing | Daytona (disposable cloud dev sandboxes — each generation run gets a fresh, isolated environment that's destroyed after) |
| Contracts | Compact / Midnight (Compact is Midnight's smart-contract language; Midnight is a privacy-preserving blockchain with private state and zero-knowledge proofs) |
| Payments | Stripe |
| Audio | TTS |
| Visuals | Image generation |
| Premium | Video generation |
| Listener client | Mobile web / QR |
| Authentication | Lightweight session identity (listener); email/OAuth for brand console |

**Authentication scope.** Listeners join via QR with a lightweight, anonymous session — no account needed. The brand console moves real money (Stripe top-ups, bids), so it requires a stronger identity (email/OAuth). For the hackathon, brand auth can be a simple email magic link; full KYC is explicitly out of scope (see [economics](../product/economics.md#listener-rewards-start-with-an-internal-balance)).
