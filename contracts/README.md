# Midnight Contracts

Compact/Midnight smart contracts for Slopstream. Lane 1 owns this directory.

Spec: [docs/technical/contracts.md](../docs/technical/contracts.md)

| Contract | Purpose | Priority |
| --- | --- | --- |
| `src/ProofOfAttention.compact` | Core primitive — proves a valid listener satisfied a challenge for a segment | P0 |
| `src/BidClearing.compact` | Auction placement and clearing against attention proofs | P0 |
| `src/RewardClearing.compact` | Reward pool creation and claim accounting | P1 (backend ledger handles distribution first) |
| `src/PreviewRightsThreshold.compact` | Prove spend threshold without exposing exact spend | P2 |

Guiding principle: **Stripe moves dollars. Midnight proves facts.** These contracts never custody funds — they prove the conditions under which the backend updates its ledger.

The `.compact` files are interface sketches until the Compact toolchain is wired up.
