# task_0004 — Wave 2 Testnet $SLOPSTREAM Rewards (SPEC, ready to build)

> Status: SPEC ONLY — do not build until Wave 2 opens (Sep 27, 2026).
> Decision (2026-09-16): **Midnight preprod, not EVM.** Pure EVM is faster
> tooling-wise but scores 0 on the 40% Engineering gate and risks a
> "not Midnight-related" ruling. Wave 2 must show *meaningful new
> Midnight-related functionality completed during that Wave*.
> EVM stays off the table unless preprod is operationally impossible.

## Goal

Watching the Eternal Loop earns something real-but-worthless. Turn the
alive URL into a growing one, cheap enough to leave running.

Framing is **points-with-a-ledger** (status, slots), never money.
No USD value promises — that road leads to money-transmitter land.

## What Wave 1 already proved

- `ProofOfAttention.compact` (102 lines, compactc 0.31.1 / lang 0.23 /
  runtime 0.16.0): nullifier circuit, 4-deep replay window,
  verifiedCount + thresholdMet, owner-gated threshold.
- SDK stack: wallet builder, witnesses, ProofOfAttentionApi
  (deploy / join / submit / read-ledger), deploy/state/submit scripts.
- Verifier: `VERIFIER_MODE=midnight` records accepted proofs on-chain,
  `midnight_<nullifier>` receipts.
- Honest gap: preprod deploy attempted, wallet sync stalled before funds
  visible. **Live preprod deployment is the Wave 2 milestone**
  (see `docs/hackathon/wave1-submission.md`).

## Scope part 1 — RewardClearing.compact (P0 for judging)

Today `contracts/src/RewardClearing.compact` is a 17-line interface
sketch. Wave 2 compiles it into a second deployable contract.

Design constraints (keep it judge-friendly, compilable on 0.31.1):

- Ledgers (public): `totalPool`, `claimedTotal`, `claimCount`,
  4-deep claim-nullifier replay window (mirror PoA pattern),
  `owner`, `sequence`, `poolActive`.
- Witnesses (private): `listenerSecret` (ephemeral,
  per-listener-per-pool, rotated every claim), `localSecretKey` (owner).
- Circuits: `createPool(total)` owner-gated (same publicKey pattern as
  PoA `setAttentionThreshold`); `claimReward(attentionNullifier,
  amount)` binds to a consumed PoA nullifier, derives
  `claimNullifier = persistentHash([listenerSecret,
  attentionNullifier])`, asserts not-replayed, shifts window,
  `claimedTotal += amount`, asserts `claimedTotal <= totalPool`;
  `closePool()` owner-gated.
- Trust assumption (state plainly in README + deck): backend computes
  the share off-chain; the contract verifies replay-protection + pool
  bounds + PoA-nullifier binding. Auditability, not recomputation.
  Acceptable because balances are internal testnet points.
- Keep `BidClearing` / `PreviewRightsThreshold` as sketches.
  One new compiling contract is the gate.

Artifacts (same pattern as PoA):

- `compactc contracts/src/RewardClearing.compact
  packages/midnight/contract/src/managed/rewardclearing`
- Commit TS bindings + zkir + prover/verifier keys.
- `packages/midnight/scripts/deploy-reward.ts`, `state-reward.ts`,
  `claim-reward.ts` (faucet-fund, dust, deploy, join, smoke claim).
- `packages/midnight/src/rewardApi.ts`: `RewardClearingApi`
  (deploy / join / createPool / claim / read-ledger), mirroring
  `ProofOfAttentionApi`.

## Scope part 2 — custodial accrual first (P0 for product)

On-chain per-proof distribution is expensive even on testnet — defer.
Ship:

- API `TokenRewardStore`: `pendingTokenRewards` per listener session,
  credited on verified attention event (evergreen rotation path +
  legacy auction path). File-backed JSON under
  `TOKEN_REWARD_STORE_PATH` (SQLite later — JSON is fine for Wave 2,
  restarts must not zero wallets is the requirement).
- `POST /rewards/claim` → faucet drip: decrements pending, increments
  `claimedTokenRewards`, returns `{ txRef: "custodial_<id>" }` now,
  `{ txHash, contractAddress }` once RewardClearing is live
  (feature-flag `REWARD_MODE=custodial | midnight`).
- Env: `REWARD_MODE`, `TOKEN_REWARD_STORE_PATH`,
  `REWARD_CLAIM_RATE_LIMIT_MS`, `REWARD_CLEARING_CONTRACT_ADDRESS`,
  `REWARD_POOL_TOTAL` (testnet points, e.g. 1_000_000).
- Durable balances: `tokenPending / tokenClaimed` survives API restart
  (test: kill + reboot, balances intact).

## Scope part 3 — anti-Sybil minimum (P1, honest not perfect)

- Per-browser session persistence (commitment bound once,
  `lastSeenAtMs` denominator already exists).
- Rate limits on `/rewards/claim` (per-session cooldown, global cap).
- Nullifier replay protection (PoA 4-window + claim 4-window).
- Threshold fraction still frozen at window open (`required_events`).
- State plainly: non-trivial, not Sybil-proof. Multi-tab farming
  expected day two.

## Scope part 4 — end-to-end UX (15% UX gate)

- `/listen`: Earn Mode → challenge → verification result →
  `+$N $SLOPSTREAM (pending)` → Claim → balance updates.
  Show `custodial` vs `midnight` receipts distinctly — never label
  JSON-stub "Verified by Midnight" (Wave 1 honesty guardrail).
- Big screen HUD: aggregate verified count + claimed total
  (counts + proofs, never identities).
- README judge path: `pnpm dev` → watch loop → answer → claim →
  `state-reward` shows on-chain `claimedTotal` move.

## QA + reliability (15% gate)

- Compact simulation tests: claim happy path, replay rejected,
  over-pool rejected, non-owner `createPool` rejected, closed-pool
  claim rejected.
- API tests: pending accrual on valid event, no accrual on invalid,
  claim decrements pending exactly once (double-claim 409),
  restart persistence, rate-limit 429.
- SDK tests: deploy → createPool → claim → read-ledger round-trip
  against preprod (marked `@preprod`, skipped in CI without seed).

## Out of scope (explicitly)

- On-chain per-proof distribution (too expensive even on testnet).
- EVM ERC-20 (kills judging eligibility — see decision above).
- Self-serve advertiser UI, live auction resurrection, Stripe payouts,
  R2/S3 asset migration, ClickHouse/Gemini tracks.
- Real-money framing, USD conversion display, transferable token claims.

## Build order (Wave 2: Sep 27 – Oct 17)

1. `RewardClearing.compact` implement + `compactc 0.31.1` compile +
   artifacts committed (unblocks everything).
2. `rewardApi.ts` + deploy/state/claim scripts + preprod deploy
   (faucet tNIGHT via UI, `SKIP_FUNDS_REQUEST=1` — Wave 1 lesson).
3. API `TokenRewardStore` + `POST /rewards/claim` (custodial first,
   `REWARD_MODE` flag).
4. Verifier wiring: midnight claim submission on drip (reuse
   `buildAttentionStack` pattern, second contract join).
5. `/listen` balance + claim UI + HUD aggregates.
6. AKINDO pack: Wave 2 progress diff, privacy section, deck delta,
   demo video (show real `midnight_` claim receipt).

## Judging mapping

- Engineering 40%: new compiling RewardClearing + private-state claim
  binding + dual-ledger + organized repo + README.
- QA 15%: simulation + API + SDK preprod round-trip tests passing.
- Product 15%: Eternal Loop → earn → claim loop, realistic roadmap.
- UX 15%: `/listen` earn/claim flow connected to contract, e2e.
- Communication 10%: video shows real preprod claim, deck Wave 1→2 diff.
- BizDev 5%: testnet points audience path, no money promises,
  advertiser staking teased as Wave 3.
- Gate: >=1 compiling Compact contract (now two), `midnightntwrk`
  topic, Apache-2.0, public repo + deck + video.

## Tooling note

Use the **Midnight Expert MCP server** for Wave 2 Compact work
(current APIs/templates, not stale training data). Kapa (docs bot)
for conceptual questions. Neither changes chain choice.

## Acceptance checklist

- [ ] RewardClearing compiles on pinned `compactc 0.31.1`, committed
- [ ] Preprod deploy receipt: address + `createPool` tx + >=1 claim tx
      with `midnight_` proof ID on video
- [ ] API restart preserves pending/claimed balances (test)
- [ ] Double-claim / over-pool / replay rejected (tests)
- [ ] `/listen` earn → claim works with `REWARD_MODE=midnight`
- [ ] `wave2-submission.md` pack written (progress diff vs Wave 1)
- [ ] No real `.env` committed, no USD promises in UI/copy
