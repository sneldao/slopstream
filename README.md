# Slopstream

**A live marketplace for human attention.**

Brands bid for attention. AI creates the content. Humans prove they paid attention. Slopstream shares the resulting value with them — distributing up to 80% of eligible advertising spend back to listeners as rewards.

## The pitch

Old advertising: pay for impressions, hope someone paid attention.

Slopstream: pay for **verified attention**.

Old media: the audience watches, the advertiser gets the value.

Slopstream: the audience watches, **the audience gets value too**. The listener is no longer merely the product — they're a participant in the marketplace.

## How it works

```
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
4. Randomized attention challenges interrupt the stream ("What did they just say?").
5. Correct answers produce a cryptographic proof of attention.
6. Only then does the advertiser spend clear — and up to 80% flows into a listener reward pool.

## Positioning

Not "an AI advertising platform." Not "blockchain advertising." Not "ad-supported streaming." Those are implementation details.

> Slopstream is a live marketplace for human attention, where cryptographic verification happens to be the thing that makes the marketplace trustworthy.

The most important product principle: **don't build an ad platform with a crypto component.** Build a human-attention marketplace. The 80/20 split gives everyone an immediate reason to care about the attention proof — it isn't technical theater, it determines when real economic value gets unlocked.

One caveat on the 80% idea: economically strong, but legally/payment-wise, don't casually market it as "sharing ad revenue" until the rules for target jurisdictions are checked. For the prototype, **"listener rewards funded by verified attention"** is the cleaner product framing.

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation map |
| [docs/product/overview.md](docs/product/overview.md) | Core idea, positioning, differentiators |
| [docs/product/economics.md](docs/product/economics.md) | Economic model, reward pools, anti-gaming |
| [docs/product/surfaces.md](docs/product/surfaces.md) | Big screen, listener client, brand console, proof receipt |
| [docs/product/content.md](docs/product/content.md) | Infinite Slop™, attention challenges, free-AI-ads growth engine |
| [docs/technical/architecture.md](docs/technical/architecture.md) | System architecture, tech stack, generation pipeline |
| [docs/technical/contracts.md](docs/technical/contracts.md) | Midnight smart contracts |
| [docs/technical/backend.md](docs/technical/backend.md) | Money architecture, ledger schema, challenge engine |
| [docs/hackathon/demo-script.md](docs/hackathon/demo-script.md) | User flows and the live demo sequence |
| [docs/hackathon/build-order.md](docs/hackathon/build-order.md) | P0 / P1 / P2 build priorities |
