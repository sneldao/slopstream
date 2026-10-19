# Wave 3 Plan — Privacy-First Comeback (Oct 27 – Nov 16, 2026)

> Status: ACTIVE. Target: Wave 3 submission on AKINDO.
> Rule: resubmission must show **meaningful new Midnight functionality completed during Wave 3**.
> Rubric: Engineering 40% / QA 15% / Product 15% / UX 15% / Comms 10% / BD 5%.
> Gate: ≥1 compiling Compact contract + `midnightntwrk` topic + public repo + deck + demo video + Apache-2.0.

## Why Wave 1 lost

Six Wave 1 winners vs Slopstream (Oct 19, 2026 review):

| Winner | Privacy thesis (one sentence) | Contracts | What judges saw |
|---|---|---|---|
| PollPower | Energy rules enforced on-chain | 7 dirs, 115 commits | `node:test` offline suites 37/37 + 44/44, design docs |
| bacchili | Prove threshold compliance w/o disclosing sensor values | edge-device + verification portal, 152 commits | Judge review guide + SHA + clean-checkout cmds |
| GYOTAK | Real seafood business, mainnet daily since Oct 4 | purchase + catch v3 (GPS hiding commitment) | Verify page, 4 independent checks, honest gaps (16/120) |
| stock-and-foil | Invoice pledged once, proven in ZK | 16 circuits, federation, fee sponsorship | JUDGES.md + PROOF.md + fast-check + honest limits + MAINNET.md |
| DareU V2 | Shielded parimutuel market | 9 circuits, cold owner + hot operator | Full lifecycle + Keeper smoke |
| Equilux | Prove pay-gap report came from complete payroll, reveal no salary | 6 circuits, 4 parties | /verify + filing pack + deployment.json + deck/brand/ |

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

- [ ] `contracts/src/ProofOfAttention.compact` — add verifier-key authorization
      (close documented "not caller-gated" hole), keep 4-deep nullifier window.
- [ ] `contracts/src/RewardClearing.compact` — replace sketch: `createRewardPool`
      (owner-gated) + `claimReward` (per-claim nullifier, no double-claim).
- [ ] `contracts/src/PreviewRightsThreshold.compact` — replace sketch: spend
      commitment + threshold proof, exact spend never disclosed.
- [ ] Pin toolchain in README: Compact 0.31.1 / language 0.23 / proof-server 8.1.x /
      midnight-js 4.1.x (same as stock-and-foil/DareU).
- [ ] Deploy all 3 to preprod → commit `contracts/preprod/deployment.json`
      (addresses + tx hashes).
- [ ] `packages/midnight` deploy/join/submit wiring for all 3; verifier defaults
      to `midnight` with `midnight_<nullifier>` receipts + tx hash on receipt.
- [ ] Add `midnightntwrk` GitHub topic (auto-DQ without it).

## QA (15%) — deliverables

- [ ] `contracts/test/*.test.mjs` on `node:test`, zero-install: mirror domain tags,
      revert strings (`Replayed attention proof rejected`, `Not the contract owner`),
      window-shift + threshold-flip pins. Target: all green, counts in PROOF.md.
- [ ] One test per refusal code + `fast-check` property test (random lifecycles vs
      reference model) — copy stock-and-foil.
- [ ] `PROOF.md` — circuit count, pass/fail, `compact compile` cmds, preprod txs.
- [ ] `JUDGES.md` — `git rev-parse HEAD`, compile/test/verify cmds, `/verify` how-to.

## UX (15%) — deliverables

- [ ] `/verify` page: shows raw state SHA-256 + byte offset + raw bytes before verdict;
      offers in-browser button + console snippet + curl one-liner; reads via
      `@midnight-ntwrk/compact-runtime` + public indexer; honest-limits box.
- [ ] Receipt shows `Verified by Midnight preprod • tx <hash>` only when real,
      else `Demo attestation`.

## Comms (10%) — AKINDO gate

- [ ] `deck/` — 8 slides: fraud problem → privacy thesis → architecture →
      thresholds → verify demo → 80/20 → Wave2→Wave3 diff → roadmap.
- [ ] 3-min video: hook → bid → QR join → challenge → receipt+clearing+verify →
      next bid. One challenge, one clearing.
- [ ] `SUBMISSION.md` — Wave 2 state → Wave 3 new circuits/tests/preprod/verify + SHAs.
- [ ] README: setup / architecture / Midnight integration / how judges test.

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
