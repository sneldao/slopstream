# Midnight Contracts

Compact/Midnight smart contracts for Slopstream. Lane 1 owns this directory.

Spec: [docs/technical/contracts.md](../docs/technical/contracts.md)

| Contract | Purpose | Priority |
| --- | --- | --- |
| `src/ProofOfAttention.compact` | Core primitive — proves a valid listener satisfied a challenge for a segment | P0 |
| `src/BidClearing.compact` | Auction placement and clearing against attention proofs | P0 |
| `src/RewardClearing.compact` | Reward pool creation and claim accounting | P2 (backend ledger handles distribution first) |
| `src/PreviewRightsThreshold.compact` | Prove spend threshold without exposing exact spend | P2 |

Guiding principle: **Stripe moves dollars. Midnight proves facts.** These contracts never custody funds — they prove the conditions under which the backend updates its ledger.

## Status

`ProofOfAttention.compact` is **real and deployable**: compiled with `compactc 0.31.1` (language 0.23 / runtime 0.16.0, matching the Midnight preprod testnet) into `packages/midnight/contract/src/managed/proofofattention` (TS bindings + prover/verifier keys). Design:

- `submitAttentionProof(segmentId, challengeId)` — hashes an ephemeral `listenerSecret` witness with the segment and challenge IDs into a nullifier, rejects replays against a 4-deep window of recently accepted nullifiers (`lastNullifier` + `prevNullifier1..3`), increments the public `verifiedCount`, and flips `thresholdMet` once the count reaches `attentionThreshold`. Segment/challenge binding is proven in-circuit and never disclosed on-chain; only the nullifier and counters are public. Known limitation on preprod: the circuit is not caller-gated — the backend ledger (not the on-chain counter) is authoritative for clearing; production needs verifier-key authorization.
- `setAttentionThreshold(newThreshold)` — owner-gated via a `publicKey(sk, sequence)` derived from a private state key.

Source changes must be recompiled with the pinned toolchain (`compactc 0.31.1`; the `compact` script in `packages/midnight`) and redeployed before `PROOF_OF_ATTENTION_CONTRACT_ADDRESS` consumers see them.

Deploy and operate it from `packages/midnight/`: `pnpm --filter @slopstream/midnight deploy` (faucet-funds a wallet, generates dust, deploys), `state` (read the ledger), `submit-proof` (smoke-test a submission).

The remaining three contracts (`BidClearing`, `RewardClearing`, `PreviewRightsThreshold`) are still interface sketches — honest placeholders for the settlement layers the backend ledger handles today.
