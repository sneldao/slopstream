# Midnight Contracts

Compact/Midnight smart contracts for Slopstream. Lane 1 owns this directory.

Spec: [docs/technical/contracts.md](../docs/technical/contracts.md)

| Contract                             | Purpose                                                                      | Priority                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `src/ProofOfAttention.compact`       | Core primitive — proves a valid listener satisfied a challenge for a segment | P0 — deployed                                  |
| `src/BidClearing.compact`            | Auction placement and clearing against attention proofs                      | P0 sketch (auction engine lives in `apps/api`) |
| `src/RewardClearing.compact`         | Reward pool creation and claim accounting                                    | P0 — Wave 3                                    |
| `src/PreviewRightsThreshold.compact` | Prove spend threshold without exposing exact spend                           | P0 — Wave 3                                    |

Guiding principle: **Stripe moves dollars. Midnight proves facts.** These contracts never custody funds — they prove the conditions under which the backend updates its ledger.

## Status

`ProofOfAttention.compact` is **real and deployable**: compiled with `compactc 0.31.1` (language 0.23 / runtime 0.16.0, matching the Midnight preprod testnet) into `packages/midnight/contract/src/managed/proofofattention` (TS bindings + prover/verifier keys). Design:

- `submitAttentionProof(segmentId, challengeId)` — hashes an ephemeral `listenerSecret` witness with the segment and challenge IDs into a nullifier, rejects replays against a 4-deep window of recently accepted nullifiers (`lastNullifier` + `prevNullifier1..3`), increments the public `verifiedCount`, and flips `thresholdMet` once the count reaches `attentionThreshold`. Segment/challenge binding is proven in-circuit and never disclosed on-chain; only the nullifier and counters are public. Caller-gated since Wave 3 by verifier-key authorization. The backend ledger (not the on-chain counter) remains authoritative for clearing.
- `setAttentionThreshold(newThreshold)` — owner-gated via a `publicKey(sk, sequence)` derived from a private state key.

Source changes must be recompiled with the pinned toolchain (`compactc 0.31.1`; the `compact` script in `packages/midnight` compiles all three) and redeployed before `PROOF_OF_ATTENTION_CONTRACT_ADDRESS` consumers see them.

Deploy and operate from `packages/midnight/`: `pnpm --filter @slopstream/midnight deploy:all` (funds one wallet, deploys all three contracts, writes `contracts/preprod/deployment.json`), `deploy` (ProofOfAttention only), `state` (read the ledger), `submit-proof` (smoke-test a submission).

Wave 3 additions:

- `RewardClearing.compact` — `createRewardPool(bidId, eligibleAmount)` is owner-gated; `claimReward(bidId, amount)` binds an ephemeral claim secret into a per-claim nullifier checked against the same 4-deep replay window, so a claim can never be replayed. Share weights stay off-chain; the claim fact is on-chain.
- `PreviewRightsThreshold.compact` — `recordSpend(spendCents)` (owner-gated) commits the brand's cumulative spend as `hash(domain-tag || spend)` — the amount itself is never on-chain; `proveQualification()` asserts the private spend meets the committed threshold and reveals only the boolean `qualified`. Strongest privacy fit: rivals see qualification, never budget.
- `ProofOfAttention.compact` — `submitAttentionProof` is now caller-gated by verifier-key (`owner == publicKey(localSecretKey(), sequence)`), closing the documented Wave 2 hole.

`BidClearing.compact` remains an interface sketch — the auction engine lives in `apps/api` (documented honestly; on-chain clearing is post-hackathon work).
