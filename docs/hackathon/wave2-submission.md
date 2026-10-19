# Slopstream — Wave 2 Submission Pack (Midnight Buildathon)

> Copy-paste-ready for the AKINDO form. Submitted **2026-10-19**.
> Repo: <https://github.com/sneldao/slopstream> · topic `midnightntwrk` · Apache-2.0 · public.
>
> **Wave labelling, so the form matches the repo:** we planned the work below as
> "Wave 3" in our own notes and finished it inside the Wave 2 window. Every
> "Wave 3" string in `SUBMISSION.md`, `docs/hackathon/wave3-plan.md` and
> `deck/` means *this* wave. The delta the judges care about is **Wave 1 → now**.

---

## 1. Progress completed during this Wave (form field 1)

Wave 1 ended with one compiling contract and a deploy that stalled on wallet
sync. This wave closed that gap and then went past it:

- **Three contracts live on Midnight preprod** — `ProofOfAttention`,
  `RewardClearing`, `PreviewRightsThreshold`, deployed from one funded wallet by
  a single `deploy:all` script that writes
  `contracts/preprod/deployment.json` (addresses + deploy tx hashes) for the
  verifier, the `/verify` page and the judges to read.
  Addresses: `{{DEPLOY_ADDR_POA}}` · `{{DEPLOY_ADDR_REWARD}}` · `{{DEPLOY_ADDR_PREVIEW}}`
- **3 → 10 exported circuits.** `RewardClearing`: owner-gated `createRewardPool`,
  per-claim-nullifier `claimReward` (exactly-once against a 4-deep replay
  window), `publicKey`. `PreviewRightsThreshold`: `recordSpend` writes only a
  commitment `hash("slopstream:spend:" || cents)` — the amount never lands on
  chain — and `proveQualification` reveals a boolean.
- **A real security hole closed.** Wave 1's `submitAttentionProof` was not
  gated, so any client could forge an "accepted" proof. It is now verifier-key
  gated (`owner == publicKey(localSecretKey(), sequence)`), and the same
  owner-gating pattern covers pool creation and threshold changes.
- **Proof provenance end to end.** `txHash` threads verifier → API → shared
  types → UI, and a receipt renders its "Verify on-chain" link only when
  `verifierMode === "midnight"`. A stub-mode receipt can never wear an
  on-chain label.
- **`/verify` — the falsifiability surface.** Browser-side read of public
  preprod indexer state; the raw state SHA-256 is shown *before* the verdict;
  console snippet, terminal one-liner and AI prompt that execute none of our
  code; and a hard rule that "no record" is only ever reported after a
  successful read — indexer failure, missing token or malformed address render
  as "state unread", never as an empty ledger.
- **Network reality handled honestly.** Midnight's hosted preprod indexer and
  RPC were decommissioned (HTTP 410) on 2026-10-09, mid-wave. We migrated
  everything — SDK, verifier, `/verify` — to Blockfrost with `?project_id=`
  auth rather than dropping the on-chain story.
- **Deployed proof-server 8.1.3** before touching preprod: 8.0.3 carried
  GHSA-wr7g-rr4v-jmj8, a one-time-check bypass, which is precisely our
  replay / double-claim threat class.
- **Toolchain discipline.** Pinned `compactc 0.31.1` / language 0.23
  (ledger-8 line, deployable to public nets). `compact update` installs 0.35.x,
  which is ledger-9 only and cannot deploy today — documented in the runbook so
  nobody "upgrades" the submission into undeployable artifacts.

- **The listener surface now says what the product means.** The demo balance
  renders as points against a ledger — no currency sign anywhere on `/listen`,
  and a test asserts the claim sheet never emits one — so the UI no longer
  contradicts the "ledger points, not cash" line above. Cold-start states were
  fixed with it: a joined listener on a dead API gets designed copy instead of
  the browser's raw `Failed to fetch`, a first load says "Connecting" rather
  than "Reconnecting" to a stream it never had, and an empty stream shows
  **Standby** instead of inventing a brand name.
- **Provider spend is bounded, and documented as bounded.** Generation cost is
  capped per call (`ELEVENLABS_MAX_TIER`, now defaulting to the cheapest tier)
  and per process (`ELEVENLABS_MAX_GENERATIONS`), both reported on the
  generator's `/health`. The steady state spends nothing because evergreen
  rotation never calls a provider at all.

**Tests:** `node --test contracts/test/*.test.mjs` → 18/18 with zero installs
(domain tags, revert strings, window shift, threshold flip, refusal codes).
Workspace suite: 342 tests green — API 95/95, generator 100/100, orchestrator
67/67, web 69/69, verifier 6/6, asset-uploader 5/5.

---

## 2. How privacy shapes the product (form field 2)

The product's claim is not "we measure attention" — it is "we can prove a slot
met a threshold without building the database everyone else would build to
check".

Private witnesses: the listener secret (ephemeral, per listener per segment,
rotated every submission), the claim secret (fresh per claim, so claims cannot
be linked across pools), and the brand's exact spend (commitment only).
Public ledgers: nullifiers, `verifiedCount`, `thresholdMet`, `claimedTotal`,
`qualified`. Never on-chain: identity, the challenge answer, reward weights,
budgets.

Three parties each lose something they used to have: brands cannot see viewers,
viewers cannot be linked across segments, rival brands cannot see each other's
spend. Stripe moves the dollars; Midnight proves the facts — no contract ever
custodies funds.

Listener rewards are **ledger points** (`$SLOPSTREAM`): status against a pool,
not cash, with no USD value promise and nothing transferable.

---

## 3. Architecture (form field 3)

```text
listener answers (private: identity, answer, session)
  -> API grades privately
  -> verifier (VERIFIER_MODE=stub | midnight)
  -> Midnight preprod ProofOfAttention.submitAttentionProof  [verifier-key gated]
  -> threshold met -> API clears bid -> RewardClearing.createRewardPool
  -> listener claimReward (per-claim nullifier) -> /verify reads public state
```

Key files: `contracts/src/*.compact`, `packages/midnight/src/{api,wallet,witnesses,sync}.ts`,
`packages/midnight/scripts/deploy-all.ts`, `apps/verifier/src/{server,midnightVerifier}.ts`,
`apps/web/app/verify/page.tsx` + `apps/web/lib/verifyProof.ts`.

---

## 4. What is real, what is not (say this before a judge asks)

| Claim | Reality |
| --- | --- |
| On-chain proof of attention | Real on preprod — nullifier + counter, verifier-gated, tx hash on the receipt |
| Reward pool + claims | Contract real on preprod; claims are fired through the SDK. The listener-facing claim UI is the next layer |
| Bid clearing | Backend ledger is authoritative; `BidClearing.compact` is a declared sketch, not a hidden one |
| Spend threshold | Contract real; `recordSpend` stores a commitment, `proveQualification` reveals only the boolean |
| Payments | Stripe in production; in-memory ledger for the hackathon |
| AI generation | Real ElevenLabs TTS / image / video behind tier caps |
| Audit / mainnet | Neither. Not audited, preprod only |

Mainnet went permissionless on 2026-10-02, so "mainnet deploy" on the roadmap no
longer needs a review slot. The ledger v8→v9 fork is in flight; our v8-compiled
artifacts stay valid across it and midnight-js 5.x is the scheduled bump.

---

## 5. Demo video

`docs/capture/slopstream-wave2.mp4` — 2:11, 1920x1080, h264+AAC. Wave 2
re-cut of the wave-1 scaffold: same footage rig, narration rewritten for the
on-chain story and stripped of USD reward framing per §2.

Beats: hook (platforms grade their own homework) → privacy thesis → the live
stream → bid + QR join → challenge → **proof submitted to `ProofOfAttention`** →
clearing + points → **`/verify` on public state** → honest close.

Media binaries are git-ignored under `docs/capture/`; upload to YouTube
(unlisted) and paste the URL in the form, same as wave 1.

---

## 6. Acceptance checklist against `wave2-task0004-rewards.md`

- [x] Compiling Compact contracts on pinned `compactc 0.31.1`, committed (3, not 1)
- [x] Preprod deploy: addresses + deploy txs in `contracts/preprod/deployment.json`
- [ ] ≥1 `claimReward` tx with a `midnight_` proof ID on video — see snippet below
- [x] Replay / double-claim / over-pool / non-owner rejection tests (18/18)
- [ ] `REWARD_MODE` + `TokenRewardStore` + `/rewards/claim` + `/listen` claim UI —
      **not built this wave**; the spec's custodial-accrual scope is the honest
      next step, and the contract it lands on is already deployed
- [x] No real `.env` committed; no USD value promises in reward copy
- [x] `wave2-submission.md` (this file), `JUDGES.md`, `PROOF.md`, deck, video

---

## 7. Paste-in slots

`contracts/preprod/deployment.json` is written by `deploy:all`. Fill these
before submitting: `{{DEPLOY_ADDR_POA}}`, `{{DEPLOY_ADDR_REWARD}}`,
`{{DEPLOY_ADDR_PREVIEW}}`, `{{DEPLOY_TX_PROOF}}`, `{{DEPLOY_TX_CLAIM}}`.

## 8. If the claim tx is still missing at minute zero

`RewardClearingApi` already exposes `createRewardPool` and `claimReward`, so a
claim on camera is a join + two calls. Drop this next to
`packages/midnight/scripts/deploy-all.ts` and run it with the same env
(`MIDNIGHT_WALLET_SEED`, `REWARD_CLEARING_CONTRACT_ADDRESS`):

```ts
// packages/midnight/scripts/claim-reward.ts — pool open, one claim, ledger read.
import { getWalletSeed, logger, waitForDust } from "./bootstrap.js";
import { buildSlopstreamStack, RewardClearingApi } from "../src/index.js";

const stack = await buildSlopstreamStack(await getWalletSeed(), logger);
const rc = await RewardClearingApi.join(
  stack.providersFor("rewardclearing"),
  process.env.REWARD_CLEARING_CONTRACT_ADDRESS!,
  logger,
);
await rc.createRewardPool(1_000_000);          // testnet points, not currency
const claim = await rc.claimReward("<midnight_nullifier_hex>", 100);
logger.info(`claim tx ${claim.txHash}`);
logger.info(JSON.stringify(await rc.readLedgerState()));
await stack.stop();
```

Check the two call signatures against `packages/midnight/src/api.ts` before
running — arg order is the one thing worth 30 seconds here. If the claim doesn't
land in time, the video's §1 beat is the **proof** tx, which is real, and the
pack says so plainly.
