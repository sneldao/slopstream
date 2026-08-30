# Slopstream Documentation

Product design and technical architecture for **The Continuum** — a live, infinite AI-generated ad stream that evolves absurd stories segment by segment. Phase one optimizes for a free, immersive, enjoyable baseline; the attention marketplace (bids, proofs, clearing, listener rewards) is the business layer on top once that stream is worth watching.

## Product

- [overview.md](product/overview.md) — north star, phased rollout, core idea, positioning, and the proof-of-use / agent-channel future direction.
- [economics.md](product/economics.md) — phased rollout of the marketplace, verified spend, the 80/20 split, the attention reward pool, bid clearing semantics, auction strategy, and anti-gaming.
- [surfaces.md](product/surfaces.md) — the three main surfaces: the big screen, the listener experience (QR + mobile web), and the brand bidding console, plus the proof receipt.
- [design-language.md](product/design-language.md) — the authoritative Continuum design system: colourful media portals, archive fragments, composition recipes, event language, theater mode, and opt-in Earn Mode.
- [content.md](product/content.md) — The Continuum (primary product), creative formats, attention challenges, and the free ad engine that powers the stream (not merely cold-start filler).

## Technical

- [architecture.md](technical/architecture.md) — system architecture diagram, component responsibilities, generation pipeline with disposable sandboxes, and the tech stack.
- [contracts.md](technical/contracts.md) — the Midnight contracts: `ProofOfAttention`, `BidClearing`, `RewardClearing`, `PreviewRightsThreshold`.
- [backend.md](technical/backend.md) — money architecture (Stripe as the only fiat rail), the Postgres ledger schema, the attention threshold and window mechanics, listener session identity, and the attention challenge engine.
- [interactive-creative.md](technical/interactive-creative.md) — post-hackathon plan for Daytona-backed premium interactive creatives, including contract, safety, fallback, and rollout requirements.

## Hackathon

- [demo-script.md](hackathon/demo-script.md) — the complete brand and listener user flows, and the eight-scene demo sequence.
- [judge-story.md](hackathon/judge-story.md) — first-10-seconds pitch, judge-friendly demo arc, technical honesty guardrails, and rehearsal checklist.
- [build-order.md](hackathon/build-order.md) — P0 must-work, P1 makes-the-demo-excellent, P2 stretch goals.
- [team-split.md](hackathon/team-split.md) — splitting the work across three parallel development lanes.
- [progress.md](hackathon/progress.md) — per-lane status: what's implemented, what's stubbed, known inconsistencies, and cross-lane integration status.
- [3d-overhaul-plan.md](hackathon/3d-overhaul-plan.md) — archived decision record for the earlier 3D fluid-world prototype.
