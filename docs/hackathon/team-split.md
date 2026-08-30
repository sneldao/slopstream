# Team Split: Three Parallel Lanes

How to divide Slopstream across three developers so everyone ships from day one with minimal coupling.

## The lanes

### Lane 1: Contracts & Clearing

**Owner scope:** everything on-chain — the trust layer.

- `ProofOfAttention` contract — the core primitive ([spec](../technical/contracts.md#1-proofofattention))
- `BidClearing` contract — auction placement and clearing against attention proofs
- `RewardClearing` contract — reward pool creation and claim accounting
- `PreviewRightsThreshold` (P2 stretch)
- Attention proof submission + verification flow (commitments, segment/challenge binding, non-replayability)
- Proof receipt data (proof IDs surfaced to the UI)

**Owns:** `contracts/`

**Mocks out:** nothing upstream; provides a JSON-stub proof verifier to the other lanes until the real contracts land.

### Lane 2: Money & Marketplace

**Owner scope:** the backend ledger and the auction economy.

- Postgres ledger schema: `brands`, `brand_balances`, `bids`, `segments`, `attention_challenges`, `listener_sessions`, `attention_events`, `reward_pools`, `listener_rewards`, `payouts` ([schema](../technical/backend.md#backend-ledger))
- Brand accounts and balances
- Stripe top-up (the only fiat rail)
- Auction logic: bid placement, outbid detection, winner selection, slot assignment
- Reward pool calculation: 80/20 split, proportional distribution over valid attention events
- Listener balances (internal balance — payouts are Wave 2)

**Owns:** `apps/api`

**Mocks out:** Stripe (test mode / fake webhooks), proof verification (accepts Lane 1's JSON stub).

### Lane 3: Stream & Experience

**Owner scope:** everything the audience and judges actually see. This is the heaviest lane.

- Stream orchestrator: queue manager, segment scheduler, bid selection hookup, challenge timing, Infinite Slop continuity ([architecture](../technical/architecture.md))
- Daytona generation pipeline: brand brief → LLM script → TTS → image (one pipeline, disposable sandboxes)
- Pre-generated attention challenges from script/transcript ([challenge engine](../technical/backend.md#attention-challenge-engine))
- Big screen: live player, leaderboard, QR code, OUTBID animation, clearing/reward animations
- Listener mobile client: QR join, stream audio, challenge UI, verification + estimated reward
- Brand console shell: balance, campaign, bid controls

**Owns:** `apps/web`, `apps/orchestrator`

**Mocks out:** generated ads (placeholder media), proofs (fake verification events).

If Lane 3 is overloaded, move the Daytona generation pipeline to Lane 2.

## The seams: contract-first on day 1

Before anyone writes feature code, all three lanes agree on the shared types in `packages/shared`:

- **WebSocket event payloads** — the live-event contract between orchestrator/API and every screen
- **Challenge payload** — `{ type, question, options, answer, segmentId, validFrom, validUntil }`
- **Attention proof submission** — `{ listenerCommitment, segmentId, challengeId, resultProof }`
- **REST shapes** — brands, bids, sessions, reward pools

When a shared type changes, the change lands in `packages/shared` first and all lanes update together. This is the only place where the lanes are allowed to touch.

## Working agreements

- **Stubs everywhere.** Lane 1 mocks proofs with a JSON blob; Lane 2 mocks Stripe; Lane 3 plays placeholder media. Every lane demos against fakes until integration day.
- **Trunk-based git.** Short-lived feature branches, small PRs; the pre-commit hooks (gitleaks + lint-staged) run on every commit.
- **No lane owns another lane's directory.** Cross-lane changes go through a PR with the owning lane reviewing.
- **Integration checkpoints.** Aim for: proofs flow through clearing (Lane 1 × 2) and bids drive the stream (Lane 2 × 3) before polishing animations.

## Sequencing risk

Lane 3 has the most surface area and everything demos through it — it should start the big screen and listener client on day one, even against hardcoded data. Lanes 1 and 2 can be a day behind on integration without hurting the demo, but Lane 3 cannot.

P0 priorities per lane are in the [build order](build-order.md).
