# Technical Architecture

## System overview

```
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
│ Reward accounting                                           │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               │ generation                │ API/events
               ▼                           ▼
┌──────────────────────────┐      ┌───────────────────────────┐
│      DAYTONA POOL        │      │       BACKEND API         │
│                          │      │                           │
│ Disposable sandbox       │      │ Brand accounts            │
│                          │      │ Stripe balances           │
│ LLM script               │      │ Listener sessions         │
│ TTS                      │      │ Reward ledger             │
│ Image generation         │      │ Scraper ingestion          │
│ Video generation         │      │ Challenge generation      │
└────────────┬─────────────┘      └─────────────┬─────────────┘
             │                                  │
             │ generated asset                  │
             ▼                                  │
      STREAM ORCHESTRATOR                      │
                                                │
                                                ▼
                              ┌─────────────────────────────┐
                              │          MIDNIGHT           │
                              │                             │
                              │ ProofOfAttention            │
                              │ BidClearing                 │
                              │ RewardClearing              │
                              │ PreviewRightsThreshold      │
                              └──────────────┬──────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────┐
                              │          STRIPE             │
                              │                             │
                              │ Brand top-ups               │
                              │ Real money rail             │
                              └─────────────────────────────┘
```

## Component responsibilities

- **Big screen** — stream playback, live leaderboard, QR code, live stats. Consumes WebSocket events.
- **Stream orchestrator** — the brain: queue manager, segment scheduler, stream continuity (Infinite Slop), bid selection, attention challenge timing, reward accounting.
- **Daytona pool** — disposable sandboxes for ad generation (LLM script, TTS, image generation, video generation).
- **Backend API** — brand accounts, Stripe balances, listener sessions, reward ledger, scraper ingestion, challenge generation.
- **Midnight** — proves conditions on-chain; see [contracts](contracts.md).
- **Stripe** — the only real-money rail; see [backend](backend.md#money-architecture).

## Generation pipeline

Each segment is isolated in a **disposable Daytona sandbox**.

```
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
| Generation | Codex-authored pipeline |
| Sandboxing | Daytona |
| Contracts | Compact / Midnight |
| Payments | Stripe |
| Audio | TTS |
| Visuals | Image generation |
| Premium | Video generation |
| Listener client | Mobile web / QR |
| Authentication | Lightweight session identity |
