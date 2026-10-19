# Judges — Verify Slopstream in 5 Minutes

> Target commit: record with `git rev-parse HEAD` at submission time.
> Clean checkout required. No wallet / chain access needed for compile + tests;
> preprod reads need public indexer only.

## 1. Pin the commit

```bash
git rev-parse HEAD
```

## 2. Compile the contracts

```bash
# install: https://docs.midnight.network — compactc 0.31.1 (language 0.23)
compactc --version
pnpm --filter @slopstream/midnight compact   # compiles all three contracts
# or individually:
compactc contracts/src/ProofOfAttention.compact ./out/proofofattention
compactc contracts/src/RewardClearing.compact ./out/rewardclearing
compactc contracts/src/PreviewRightsThreshold.compact ./out/previewrightsthreshold
```

Expected: `Compiling N circuits:` + `compiler/ contract/ keys/ zkir/` in each out dir.
Precompiled artifacts for all three are also committed under
`packages/midnight/contract/src/managed/` if you only want to run tests.

## 3. Run the circuit-mirror tests (no install)

```bash
node --test contracts/test/*.test.mjs
```

Expected: all pass (counts in `PROOF.md`).

## 4. Run the API + verifier suites

```bash
pnpm --filter @slopstream/shared build
pnpm --filter @slopstream/verifier test
pnpm --filter @slopstream/api test
```

## 5. Verify a real proof (no trust in us)

1. Open `/verify?nullifier=<nullifier-from-receipt>`.
2. Page shows raw state SHA-256 + byte offset + raw bytes BEFORE verdict
   (falsifiable commitments — mismatched indexer state is caught).
3. Four independent checks: in-browser button, console snippet,
   terminal one-liner, AI-assistant prompt. The button runs our code;
   the snippet does not.
4. `No record found` appears ONLY when state was read and has no entry;
   indexer failures are reported as failures, never as absence.

## 6. Live loop (stub vs midnight)

- Stub: `VERIFIER_MODE=stub` — typed JSON checks, `verifierMode: "stub"`.
- Midnight: `VERIFIER_MODE=midnight` + `PROOF_OF_ATTENTION_CONTRACT_ADDRESS`
  (from `contracts/preprod/deployment.json`) — receipts carry
  `verifierMode: "midnight"`, `midnight_<nullifier>` proof ID + tx hash.
- Never label a stub receipt "Verified by Midnight".

## Deployment record

See `contracts/preprod/deployment.json` for contract addresses + tx hashes.
See `PROOF.md` for circuit counts, test counts, and live evidence.
