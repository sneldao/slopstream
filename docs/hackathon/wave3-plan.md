# Wave 3 Plan — Privacy-First Comeback (Oct 27 – Nov 16, 2026)

> Status: ACTIVE. Target: Wave 3 submission on AKINDO.
> Rule: resubmission must show **meaningful new Midnight functionality completed during Wave 3**.
> Rubric: Engineering 40% / QA 15% / Product 15% / UX 15% / Comms 10% / BD 5%.
> Gate: ≥1 compiling Compact contract + `midnightntwrk` topic + public repo + deck + demo video + Apache-2.0.

## Why Wave 1 lost

Six Wave 1 winners vs Slopstream (Oct 19, 2026 review):

| Winner         | Privacy thesis (one sentence)                                     | Contracts                                      | What judges saw                                                |
| -------------- | ----------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| PollPower      | Energy rules enforced on-chain                                    | 7 dirs, 115 commits                            | `node:test` offline suites 37/37 + 44/44, design docs          |
| bacchili       | Prove threshold compliance w/o disclosing sensor values           | edge-device + verification portal, 152 commits | Judge review guide + SHA + clean-checkout cmds                 |
| GYOTAK         | Real seafood business, mainnet daily since Oct 4                  | purchase + catch v3 (GPS hiding commitment)    | Verify page, 4 independent checks, honest gaps (16/120)        |
| stock-and-foil | Invoice pledged once, proven in ZK                                | 16 circuits, federation, fee sponsorship       | JUDGES.md + PROOF.md + fast-check + honest limits + MAINNET.md |
| DareU V2       | Shielded parimutuel market                                        | 9 circuits, cold owner + hot operator          | Full lifecycle + Keeper smoke                                  |
| Equilux        | Prove pay-gap report came from complete payroll, reveal no salary | 6 circuits, 4 parties                          | /verify + filing pack + deployment.json + deck/brand/          |

Slopstream gaps: 1 contract / 1 real circuit; `submitAttentionProof` not caller-gated;
backend ledger authoritative (contract corroborating); `VERIFIER_MODE=stub` default;
no `PROOF.md`/`JUDGES.md`/`/verify`; no Compact-mirroring tests; framing is
"fun ads" not serious privacy.

## Reframe (Product 15% + BD 5%)

> Slopstream proves an ad slot met verified-attention threshold **without revealing
> who watched, what they answered, or building a profiling database** — brands can't
> see viewers, viewers can't be linked across segments, rivals can't see spend.

Privacy story = 3 contracts:

1. `ProofOfAttention` — listener proves challenge condition for this segment;
   only nullifier + count + threshold flag go public.
2. `RewardClearing` — pool creation + per-listener claim; share weights
   (difficulty/duration/uniqueness) stay hidden.
3. `PreviewRightsThreshold` — brand proves `spent >= threshold` without revealing
   exact spend. Strongest ZK fit (same class as Equilux/sensors).

`Stripe moves dollars, Midnight proves facts.` Backend ledger stays authoritative
for clearing during hackathon; contracts provide auditability + non-repudiation.
Say so plainly (honesty scored).

## Engineering (40%) — deliverables

- [x] `contracts/src/ProofOfAttention.compact` — verifier-key authorization added
      (`owner == publicKey(localSecretKey(), sequence)`), 4-deep window kept.
- [x] `contracts/src/RewardClearing.compact` — `createRewardPool` (owner-gated) +
      `claimReward` (per-claim nullifier, no double-claim). Compiles clean.
- [x] `contracts/src/PreviewRightsThreshold.compact` — spend commitment +
      `proveQualification`, exact spend never disclosed. Compiles clean
      (comparison wrapped in `disclose`).
- [x] Toolchain pinned: compactc 0.31.1 / language 0.23 / midnight-js 4.1.x
      (README + PROOF.md). All 3 compiled to `packages/midnight/contract/src/managed/`.
- [ ] Deploy all 3 to preprod → commit `contracts/preprod/deployment.json`
      (addresses + tx hashes). **READY on nuncio-vultr** — repo at HEAD,
      proof-server upgraded to 8.1.3, deploy.env has seed + password; the only
      missing piece is a `MIDNIGHT_BLOCKFROST_PROJECT_ID` (create a Midnight
      Preprod project at blockfrost.io). See "Deploy runbook" below.
- [x] `packages/midnight` deploy/join/submit wiring for all 3
      (`providersFor(contract)`, `deploy:all` script writes deployment.json);
      receipts carry `txHash` end-to-end (verifier → api → shared → UI).
- [x] `midnightntwrk` GitHub topic added (repo also tagged: midnight, compact,
      zero-knowledge, privacy, attention-economy).

## QA (15%) — deliverables

- [x] `contracts/test/*.test.mjs` on `node:test`, zero-install — 18/18 green:
      domain tags, revert strings, window-shift, threshold-flip, refusal codes.
- [ ] `fast-check` property test (random lifecycles vs reference model) —
      copy stock-and-foil. **Nice-to-have, mirror suites already green.**
- [x] `PROOF.md` — circuit count (10 exported), pass/fail, `compactc` cmds;
      preprod txs fill in at deploy.
- [x] `JUDGES.md` — `git rev-parse HEAD`, compile/test/verify cmds, `/verify` how-to.

## UX (15%) — deliverables

- [x] `/verify` page (`apps/web/app/verify/`): deep-links from receipts
      (`?nullifier=`), shows raw state SHA-256 before verdict, in-browser button +
      console snippet + terminal one-liner + AI prompt, reads the public preprod
      indexer, honest-limits box, never reports "no record" on indexer failure.
- [x] Receipt shows Midnight tx hash + "Verify on-chain" link only when
      `verifierMode === "midnight"` (`ProofReceipt.tsx`).

## Comms (10%) — AKINDO gate

- [x] `deck/slides.md` — 8-slide outline: fraud problem → privacy thesis →
      architecture → mechanics → /verify demo → Wave2→Wave3 diff → roadmap.
      **Remaining: render to actual slides for AKINDO.**
- [ ] 3-min video: hook → bid → QR join → challenge → receipt+clearing+verify →
      next bid. One challenge, one clearing.
- [x] `SUBMISSION.md` — Wave 2 → Wave 3 diff table, circuit list, verify steps,
      honest limits, roadmap.
- [ ] README: setup / architecture / Midnight integration / how judges test.

## Deploy runbook (the remaining blocker)

Preprod deploy needs a proof server + funded wallet + Blockfrost token.
Nothing local — run on nuncio-vultr (`~/slopstream-deploy`, proof-server
container already up; bump it to `midnightntwrk/proof-server:8.1.3` first —
8.1.3 patches critical GHSA-wr7g-rr4v-jmj8, a one-time-check bypass that is
exactly our replay/double-claim threat class).

```bash
# 0. Prereqs (2026-10 network change):
#    - MIDNIGHT_BLOCKFROST_PROJECT_ID — Midnight's own preprod indexer/RPC
#      were decommissioned 2026-10-09 (410 ENDPOINT_DECOMMISSIONED). Blockfrost
#      serves them now: create a Midnight Preprod project at blockfrost.io.
#    - proof-server 8.1.3 (ledger 8.1.3 / node 1.0.400 line — the supported
#      matrix for public networks)
#    - DO NOT run bare `compact update` — it installs 0.35.x (ledger-9 only,
#      undeployable to preprod/mainnet today). Stay on compactc 0.31.1.

export MIDNIGHT_PRIVATE_STATE_PASSWORD=<pick one>
export MIDNIGHT_BLOCKFROST_PROJECT_ID=<blockfrost preprod project>
export MIDNIGHT_PROOF_SERVER_URL=http://127.0.0.1:6300
pnpm --filter @slopstream/midnight deploy:all
#    Writes contracts/preprod/deployment.json with addresses + tx hashes.
#    If the faucet endpoint is a no-op: claim tNIGHT via the faucet UI,
#    then SKIP_FUNDS_REQUEST=1 ... deploy:all

# Then flip the verifier to midnight mode:
export PROOF_OF_ATTENTION_CONTRACT_ADDRESS=<from deployment.json>
export VERIFIER_MODE=midnight
```

## Network state (2026-10-19 research refresh)

- **Mainnet went permissionless Oct 2** — contracts deploy without review.
  Submission stays on preprod (free faucet, judges verify there) but the
  roadmap can now credibly say "mainnet deploy" — no review gate remains.
- **Ledger v8→v9 hard fork is in flight** (node 2.1.0-rc.x on dev/stagenet;
  public nets still on ledger 8 / node 1.0.400). Deployed v8-compiled
  contracts keep working post-fork without recompile — midnight-js v5 handles
  era routing. Our compiled artifacts are forward-compatible.
- **midnight-js 5.0.0 is RC (rc.5, Oct 17)** — required upgrade before the
  v9 fork: `MidnightConfig` replaces `setNetworkId`, unified `MidnightJsError`,
  ESM-only, Node 22.12+. Stay on 4.1.1 for this wave; schedule the v5 bump
  before the fork lands on preprod.
- **Compact 0.34/0.35 (language 0.26/0.27)** bring `kernel.caller()` (real
  caller identity — could replace our publicKey-hash verifier gate),
  cross-contract calls, events, P256/Ed25519/SHA-512 — all ledger-9 only.
  Roadmap fodder, not this wave.
- **proof-server 8.1.3** (Oct 2) is a critical security patch; 8.0.3 on the
  VPS must be bumped before deploy.
- New browser-facing verifier reality: /verify needs a Blockfrost project_id
  (NEXT_PUBLIC_BLOCKFROST_MIDNIGHT_PROJECT_ID) — the old public indexer is 410.

## Wave narrative

- Wave 1: stub loop (bid → generate → play → challenge → receipt → clearing 80/20).
- Wave 2: preprod `ProofOfAttention` (current `main`).
- Wave 3 (this): full clearing + spend-threshold + `/verify` + pilot
  (one live brand + 10 listeners on video).

## Execution order

1. Contracts (Reward + Threshold + verifier-gate) + compile.
2. node:test mirrors + PROOF.md counts.
3. Preprod deploy + deployment.json.
4. /verify + receipt provenance.
5. Deck + video + SUBMISSION.md.
