# Slopstream Documentation

Product design and technical architecture for a live, infinite AI-generated advertising stream where brands bid for attention, AI generates the ads in real time, and listeners earn rewards by proving they actually paid attention.

## Product

- [overview.md](product/overview.md) — the core idea, what makes Slopstream different, positioning, and the central product principle.
- [economics.md](product/economics.md) — the economic model: verified spend, the 80/20 split, the attention reward pool (don't pay per question), and the anti-gaming layer.
- [surfaces.md](product/surfaces.md) — the three main surfaces: the big screen, the listener experience (QR + mobile web), and the brand bidding console, plus the proof receipt.
- [content.md](product/content.md) — Infinite Slop™ continuity, randomized attention challenge types, and the free-AI-ads cold-start engine with company claim pages.

## Technical

- [architecture.md](technical/architecture.md) — system architecture diagram, component responsibilities, generation pipeline with disposable sandboxes, and the tech stack.
- [contracts.md](technical/contracts.md) — the Midnight contracts: `ProofOfAttention`, `BidClearing`, `RewardClearing`, `PreviewRightsThreshold`.
- [backend.md](technical/backend.md) — money architecture (Stripe as the only fiat rail), the Postgres ledger schema, and the attention challenge engine.

## Hackathon

- [demo-script.md](hackathon/demo-script.md) — the complete brand and listener user flows, and the eight-scene demo sequence.
- [build-order.md](hackathon/build-order.md) — P0 must-work, P1 makes-the-demo-excellent, P2 stretch goals.
- [team-split.md](hackathon/team-split.md) — splitting the work across three parallel development lanes.
