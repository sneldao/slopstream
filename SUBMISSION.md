# Slopstream — Wave 3 Submission

> Privacy-first attention settlement for a live AI-generated ad stream.
> **Stripe moves dollars. Midnight proves facts.**

## The privacy thesis (what changed in framing)

Slopstream proves an ad slot met a verified-attention threshold **without
revealing who watched, what they answered, or building a profiling database** —
brands can't see viewers, viewers can't be linked across segments, and rival
brands can't see each other's spend. Ad-fraud and GDPR-style profiling are the
real problem; the "weird infinite AI ad stream" is just the demo surface.

## Wave 2 → Wave 3 diff (meaningful new Midnight functionality)

| Area               | Wave 2 (`main` at wave close)                      | Wave 3 (this submission)                                                                         |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Contracts          | 1 (`ProofOfAttention`)                             | 3 (`ProofOfAttention`, `RewardClearing`, `PreviewRightsThreshold`)                               |
| Exported circuits  | 3                                                  | 10                                                                                               |
| Caller-gating      | `submitAttentionProof` not gated (documented hole) | Verifier-key gated: `owner == publicKey(localSecretKey(), sequence)`                             |
| Compiled artifacts | `managed/proofofattention` only                    | `managed/{proofofattention,rewardclearing,previewrightsthreshold}` committed                     |
| Deploy wiring      | single-contract `deploy` script                    | `deploy:all` — one wallet, three contracts, writes `contracts/preprod/deployment.json`           |
| Receipts           | `verifierMode` label only                          | `txHash` threaded verifier → api → shared → UI; `/verify?nullifier=` deep-link                   |
| Verification       | none                                               | `/verify` page: raw state SHA-256 + independent console/terminal/AI checks                       |
| Tests              | verifier/api vitest only                           | + `contracts/test/*.test.mjs` circuit mirrors, `node --test`, zero installs — 18/18              |
| Judge pack         | none                                               | `JUDGES.md` + `PROOF.md` + this file                                                             |
| Network layer      | Midnight-hosted preprod indexer/RPC                | Blockfrost indexer/RPC + `?project_id=` auth — the old endpoints went 410 on 2026-10-09 mid-wave |

## Circuits (10 exported)

- **ProofOfAttention** — `submitAttentionProof` (verifier-key gated, 4-deep
  nullifier replay window, verifiedCount + thresholdMet), `setAttentionThreshold`
  (owner-gated), `publicKey`.
- **RewardClearing** — `createRewardPool` (owner-gated), `claimReward`
  (per-claim nullifier, exactly-once against the replay window), `publicKey`.
- **PreviewRightsThreshold** — `recordSpend` (owner-gated spend commitment:
  `hash("slopstream:spend:" || cents)` — the amount never lands on-chain),
  `proveQualification` (reveals only the boolean), `setSpendThreshold`, `publicKey`.

## How to verify (5 minutes)

See `JUDGES.md`. Short version:

```bash
git rev-parse HEAD
pnpm --filter @slopstream/midnight compact     # compiles all 3 (compactc 0.31.1)
node --test contracts/test/*.test.mjs          # 18/18, zero installs
pnpm --filter @slopstream/verifier test        # 6/6
pnpm --filter @slopstream/api test             # 90/90
```

Then open `/verify` on the deployed web app and paste a `midnight_<hex>`
nullifier from a receipt.

## Honest limits

- Backend ledger remains authoritative for clearing during the hackathon;
  on-chain records are corroborating evidence + non-repudiation.
- `BidClearing.compact` is still a sketch — the auction engine lives in
  `apps/api`. Saying so plainly rather than shipping a hollow contract.
- Not audited. Preprod, not mainnet.

## Roadmap

- Wave 1: stub loop (bid → generate → play → challenge → receipt → 80/20 clearing).
- Wave 2: preprod `ProofOfAttention`.
- Wave 3 (this): clearing + spend-threshold contracts, verifier-gating,
  judge-verifiable proof surface, Blockfrost migration.
- Next: on-chain bid clearing, DUST-funded listener wallets, pilot with one
  live brand + 10 listeners. Midnight mainnet opened permissionless deployment
  on 2026-10-02 — production deploy no longer needs a review slot. Before the
  ledger v8→v9 fork reaches preprod: bump to midnight-js 5.x (our v8-compiled
  contracts keep working across the fork — no recompile needed).

License: Apache-2.0. Toolchain: compactc 0.31.1 / language 0.23 / midnight-js 4.1.x.
