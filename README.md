# Slopstream

**A live marketplace for human attention.**

Brands bid for attention. AI creates the content. Humans prove they engaged with it. Slopstream shares the resulting value with them — distributing up to 80% of eligible advertising spend back to listeners as rewards.

## The pitch

Old advertising: pay for impressions, hope someone paid attention.

Slopstream: pay for **verified attention**.

Old media: the audience watches, the advertiser gets the value.

Slopstream: the audience watches, **the audience gets value too**. The listener is no longer merely the product — they're a participant in the marketplace.

## How it works

```text
BRANDS
   │ bid $
   ▼
AI AD STREAM (infinite, AI-generated)
   │ attention
   ▼
PROOF OF ATTENTION (cryptographic verification)
   │ verified
   ▼
$ REWARD
   ├── LISTENERS  80%
   └── SLOPSTREAM 20%
```

1. Brands bid for upcoming ad slots in a live auction.
2. AI generates the ad in real time — audio, image, or video depending on the bid tier.
3. Listeners join by scanning a QR code (no app, just mobile web).
4. Listeners can optionally enable Earn Mode and answer randomized attention challenges ("What did they just say?").
5. Correct answers produce a verification result that the attention condition was satisfied.
6. Once a segment clears its attention threshold the advertiser spend clears — and up to 80% flows into a listener reward pool.

Attention is verified by a real Midnight contract. `ProofOfAttention.compact` (Compact 0.23, compiled against the preprod testnet toolchain) records each verified listener as an on-chain nullifier — the listener secret is an ephemeral witness that lives only in the prover's private state (rotated every submission); just a ZK proof and the replay-protecting nullifier land on-chain, and segment/challenge binding is proven in-circuit, never disclosed — and flips a public threshold flag that the backend watches before clearing advertiser spend. Replays are rejected against a 4-deep window of recently accepted nullifiers. On preprod the on-chain counter is corroborating evidence: the backend's own ledger of graded attention events is authoritative for clearing. The verifier (`apps/verifier`) runs in two modes: `VERIFIER_MODE=stub` (typed JSON checks, for offline demos) and `VERIFIER_MODE=midnight` (submits real proofs to the deployed contract on Midnight preprod).

## Positioning

Not "an AI advertising platform." Not "blockchain advertising." Not "ad-supported streaming." Those are implementation details.

> Slopstream is a live marketplace for human attention, where cryptographic verification happens to be the thing that makes the marketplace trustworthy.

The most important product principle: **don't build an ad platform with a crypto component.** Build a human-attention marketplace. The 80/20 split gives everyone an immediate reason to care about the attention proof — it isn't technical theater, it determines when real economic value gets unlocked.

One caveat on the 80% idea: economically strong, but legally/payment-wise, don't casually market it as "sharing ad revenue" until the rules for target jurisdictions are checked. For the prototype, **"listener rewards funded by verified attention"** is the cleaner product framing.

## Repository layout

```text
contracts/              Midnight/Compact contracts (Lane 1)
packages/shared/        Shared types: WS events, challenges, proofs, bids
packages/midnight/      Compiled ProofOfAttention artifacts + Midnight SDK wiring (deploy, state, submit-proof)
apps/api/               Backend API: ledger, auction, Stripe (Lane 2)
apps/verifier/          Attention-proof verifier — stub JSON or live Midnight proofs (Lane 1)
apps/orchestrator/      Stream orchestrator + WebSocket gateway (Lane 3)
apps/generator/         Daytona generation pipeline + scraper (Lane 1)
apps/web/               Next.js: big screen, listener client, brand console (Lane 3)
docs/                   Product design and technical architecture
```

Setup: `pnpm install`, then `pnpm dev:web` / `pnpm dev:api` / `pnpm dev:verifier` / `pnpm dev:orchestrator` / `pnpm dev:generator`. See [docs/hackathon/team-split.md](docs/hackathon/team-split.md).

## Documentation

| Doc                                                                | Contents                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [docs/README.md](docs/README.md)                                   | Documentation map                                                               |
| [docs/product/overview.md](docs/product/overview.md)               | Core idea, positioning, differentiators, proof-of-use future direction          |
| [docs/product/economics.md](docs/product/economics.md)             | Economic model, reward pools, auction strategy, anti-gaming                     |
| [docs/product/surfaces.md](docs/product/surfaces.md)               | Big screen, listener client, brand console, proof receipt                       |
| [docs/product/design-language.md](docs/product/design-language.md) | Living canvas aesthetic, fluid event reactions, build stack                     |
| [docs/product/content.md](docs/product/content.md)                 | The Continuum, attention challenges, free-AI-ads growth engine                  |
| [docs/technical/architecture.md](docs/technical/architecture.md)   | System architecture, tech stack, generation pipeline                            |
| [docs/technical/contracts.md](docs/technical/contracts.md)         | Midnight smart contracts                                                        |
| [docs/technical/backend.md](docs/technical/backend.md)             | Money architecture, ledger schema, threshold/window mechanics, challenge engine |
| [docs/hackathon/demo-script.md](docs/hackathon/demo-script.md)     | User flows and the live demo sequence                                           |
| [docs/hackathon/judge-story.md](docs/hackathon/judge-story.md)     | First-10-seconds pitch, judge-friendly demo arc, and rehearsal guide            |
| [docs/hackathon/build-order.md](docs/hackathon/build-order.md)     | P0 / P1 / P2 build priorities                                                   |
| [docs/hackathon/team-split.md](docs/hackathon/team-split.md)       | Three parallel development lanes and shared-type seams                          |
