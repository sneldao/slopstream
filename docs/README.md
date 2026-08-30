# Slopstream Documentation

Product design and technical architecture for a live, infinite AI-generated advertising stream where brands bid for attention, AI generates the ads in real time, and listeners earn rewards by proving they actually paid attention.

## Product

- [overview.md](product/overview.md) — the core idea, what makes Slopstream different, positioning, the central product principle, and the proof-of-use / agent-channel future direction.
- [economics.md](product/economics.md) — the economic model: verified spend, the 80/20 split, the attention reward pool (don't pay per question), bid clearing semantics, auction strategy and theory, and the anti-gaming layer.
- [surfaces.md](product/surfaces.md) — the three main surfaces: the big screen, the listener experience (QR + mobile web), and the brand bidding console, plus the proof receipt.
- [design-language.md](product/design-language.md) — the authoritative Continuum design system: colourful media portals, archive fragments, composition recipes, event language, theater mode, and opt-in Earn Mode.
- [content.md](product/content.md) — The Continuum (evolving ad-story continuity), randomized attention challenge types, and the free-AI-ads cold-start engine with company claim pages.

## Technical

- [architecture.md](technical/architecture.md) — system architecture diagram, component responsibilities, generation pipeline with disposable sandboxes, and the tech stack.
- [contracts.md](technical/contracts.md) — the Midnight contracts: `ProofOfAttention`, `BidClearing`, `RewardClearing`, `PreviewRightsThreshold`.
- [backend.md](technical/backend.md) — money architecture (Stripe as the only fiat rail), the Postgres ledger schema, the attention threshold and window mechanics, listener session identity, and the attention challenge engine.

## Hackathon

- [demo-script.md](hackathon/demo-script.md) — the complete brand and listener user flows, and the eight-scene demo sequence.
- [judge-story.md](hackathon/judge-story.md) — first-10-seconds pitch, judge-friendly demo arc, technical honesty guardrails, and rehearsal checklist.
- [build-order.md](hackathon/build-order.md) — P0 must-work, P1 makes-the-demo-excellent, P2 stretch goals.
- [team-split.md](hackathon/team-split.md) — splitting the work across three parallel development lanes.
- [progress.md](hackathon/progress.md) — per-lane status: what's implemented, what's stubbed, known inconsistencies, and cross-lane integration status.
- [3d-overhaul-plan.md](hackathon/3d-overhaul-plan.md) — archived decision record for the earlier 3D fluid-world prototype.
