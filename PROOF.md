# Proof — What Was Proven, Where, How to Recheck

> Updated at Wave 3 submission. Counts below are filled when circuits + tests land.

## Circuits

| Contract | Circuits | Status |
|---|---|---|
| `ProofOfAttention.compact` | `submitAttentionProof`, `setAttentionThreshold` (+ verifier-gate) | preprod |
| `RewardClearing.compact` | `createRewardPool`, `claimReward` | preprod |
| `PreviewRightsThreshold.compact` | spend commitment + threshold proof | preprod |

Total: 10 circuits (3 ProofOfAttention + 3 RewardClearing + 4 PreviewRightsThreshold).

Toolchain: Compact 0.31.1 / language 0.23 / proof-server 8.1.x / midnight-js 4.1.x.

Build:

```bash
compact compile contracts/src/ProofOfAttention.compact ./out/proof-of-attention
compact compile contracts/src/RewardClearing.compact ./out/reward-clearing
compact compile contracts/src/PreviewRightsThreshold.compact ./out/preview-rights
```

## Tests

| Suite | Runner | Result |
|---|---|---|
| `contracts/test/*.test.mjs` (domain tags, revert strings, window-shift, threshold-flip, refusal codes) | `node --test` | 18 / 18 pass |
| property model (`fast-check`, random lifecycles vs reference) | vitest | __ / __ pass |
| `apps/verifier` stub + midnight suites | vitest | pass |
| `apps/api` money/auction/clearing suites (30 tests) | vitest | pass |

## Live evidence (preprod)

Deployment record: `contracts/preprod/deployment.json`.

| Contract | Address | Deploy tx |
|---|---|---|
| ProofOfAttention | _TBD_ | _TBD_ |
| RewardClearing | _TBD_ | _TBD_ |
| PreviewRightsThreshold | _TBD_ | _TBD_ |

Sample verified receipt: nullifier `midnight_<hex>` → check at `/verify`.

## Honest limits

- Backend ledger is authoritative for clearing during the hackathon; on-chain
  counters are corroborating evidence + non-repudiation, not independent settlement.
- `RewardClearing` weights are computed off-chain; the contract verifies the claim,
  it does not recompute shares (acceptable: balances are internal, no fiat leaves).
- Visitor-wallet writes need DUST in that wallet; preprod deployment runs from our
  wallet via CI.
- A buyer colluding with a supplier (fake attention event) is non-repudiable once
  recorded, not prevented. Timing of events is correlatable by observers.
- Not audited. Not mainnet.

## What changed since Wave 2

- Wave 2: preprod `ProofOfAttention` (single contract, stub-default verifier).
- Wave 3 (this wave): + `RewardClearing` + `PreviewRightsThreshold` circuits,
  verifier-key gate, Compact-mirroring `node:test` suites, preprod deployment of
  all three, `/verify` page, deck + video.
