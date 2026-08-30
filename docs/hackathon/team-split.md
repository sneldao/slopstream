# Team Split: Three Parallel Lanes

How to divide Slopstream across three developers so everyone ships from day one with minimal coupling.

## The lanes

### Lane 1: Contracts & Clearing

**Owner scope:** everything on-chain — the trust layer.

- `ProofOfAttention` contract — the core primitive ([spec](../technical/contracts.md#1-proofofattention))
- `BidClearing` contract — auction placement and clearing against attention proofs
- `RewardClearing` contract — reward pool creation and claim accounting (P2; backend ledger handles distribution for the hackathon)
- `PreviewRightsThreshold` (P2 stretch)
- Attention proof submission + verification flow (commitments, segment/challenge binding, non-replayability)
- Proof receipt data (proof IDs surfaced to the UI)

**Owns:** `contracts/`

**Mocks out:** nothing upstream; provides a JSON-stub proof verifier to the other lanes until the real contracts land.

**Slip contingency:** if the real contracts don't land in time, the demo runs on the JSON-stub proof verifier — the stub is the fallback, not a failure. The demo only needs to show proof IDs and verification results; the stub provides those.

### Lane 2: Money & Marketplace

**Owner scope:** the backend ledger and the auction economy.

- Postgres ledger schema: `brands`, `brand_balances`, `bids`, `segments`, `attention_challenges`, `listener_sessions`, `attention_events`, `reward_pools`, `listener_rewards`, `payouts` ([schema](../technical/backend.md#backend-ledger))
- Brand accounts and balances
- Stripe top-up (the only fiat rail)
- Auction logic: bid placement, outbid detection, winner selection, slot assignment
- Reward pool calculation: 80/20 split, proportional distribution over valid attention events
- Listener balances (internal balance — payouts are Wave 2)
- Challenge generation: transcript + metadata → challenge JSON ([challenge engine](../technical/backend.md#attention-challenge-engine)). Lane 2 decides *what* the challenges are; Lane 3 decides *when* they fire.
- Attention proof intake: listener submits `AttentionProofSubmission` → Lane 2 persists → Lane 1 verifies → Lane 2 records valid event + updates counts → publishes `attention.verified` via Redis. Lane 2 is the authoritative source for verification state; Lane 3 never emits this event independently.
- Emit persisted marketplace WebSocket events (`bid.placed`, `bid.outbid`, `leaderboard.updated`, `attention.verified`, `bid.cleared`, `bid.uncleared`, `reward.pool.updated`, `stats.updated`) via Redis pub/sub — the orchestrator (Lane 3) owns the WS server and fans these out to screens

**Owns:** `apps/api`

**Mocks out:** Stripe (test mode / fake webhooks), proof verification (accepts Lane 1's JSON stub).

### Lane 3: Stream & Experience

**Owner scope:** everything the audience and judges actually see. This is the heaviest lane.

- Stream orchestrator: queue manager, segment scheduler, bid selection hookup, challenge timing (when to fire, not what they are), Infinite Slop continuity ([architecture](../technical/architecture.md))
- Daytona generation pipeline: brand brief → LLM script → TTS → image (one pipeline, disposable sandboxes)
- WebSocket server: the single WS endpoint all screens connect to. Subscribes to Redis pub/sub for Lane 2's persisted marketplace events and emits orchestrator-runtime events (`segment.generating`, `generation.progress`, `segment.ready`, `segment.playing`, `challenge.fired`) directly. Fans out the full `WsEvent` stream to every connected screen. Lane 3 never emits marketplace-state events (`bid.*`, `attention.verified`, `reward.*`, `stats.*`, `leaderboard.*`) — those come from Lane 2 via Redis.
- Big screen: live player, leaderboard, QR code, OUTBID animation, clearing/reward animations
- Listener mobile client: QR join, stream audio, challenge UI, verification + estimated reward
- Brand console shell: balance, campaign, bid controls

**Owns:** `apps/web`, `apps/orchestrator`

**Mocks out:** generated ads (placeholder media), proofs (fake verification events), bid/leaderboard/clearing data (hardcoded until Lane 2 integrates).

If Lane 3 is overloaded, move the Daytona generation pipeline to Lane 2.

## The seams: contract-first on day 1

The shared types are already defined in [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts) — this file is the canonical contract. All three lanes code against these types; no lane invents its own shapes. The key contracts:

- **`WsEvent`** — the discriminated union of all WebSocket events (13 event types: `bid.placed`, `bid.outbid`, `leaderboard.updated`, `segment.generating`, `generation.progress`, `segment.ready`, `segment.playing`, `challenge.fired`, `attention.verified`, `bid.cleared`, `bid.uncleared`, `reward.pool.updated`, `stats.updated`). This is the live-event contract between orchestrator/API and every screen.
- **`Challenge`** — `{ id, type, question, options?, answer, segmentId, validFrom, validUntil, difficulty }`. Backend-only; includes the answer. Generated by Lane 2, stored server-side, never sent over WebSocket.
- **`PublicChallenge`** — same as `Challenge` minus `answer`. This is what `challenge.fired` carries over WebSocket and what the listener client renders. Lane 2 holds the full `Challenge`; the client never receives the answer.
- **`AttentionProofSubmission`** — `{ listenerCommitment, segmentId, challengeId, resultProof }`. Submitted by Lane 3's listener client to Lane 2's API, verified by Lane 1.
- **`AttentionProofReceipt`** — `{ proofId, segmentId, challengeId, brandId, challengeType, verified, estimatedRewardUsd?, createdAt }`. Issued by Lane 1 (via Lane 2's API), displayed by Lane 3.
- **REST/entity shapes** — `Bid`, `Segment`, `RewardPool`, `ListenerSession`, `ProductionTier`, `BidStatus`, `SegmentStatus`, `RewardPoolStatus`.

**Source of truth for live events:** Lane 2 publishes persisted marketplace events to Redis; Lane 3 subscribes and fans them out over WebSockets. Lane 3 may publish only orchestrator-runtime events (`segment.*`, `generation.progress`, `challenge.fired`), which must use the shared `WsEvent` contract. Every `WsEvent` type has exactly one authoritative emitter.

All cross-lane payload and protocol changes must be represented in `packages/shared/src/index.ts` first. No lane introduces an undocumented cross-lane dependency (REST endpoint shapes, Redis topic names, the proof-verifier interface, demo fixtures, and environment variables all count).

## Working agreements

- **Stubs everywhere.** Lane 1 mocks proofs with a JSON blob; Lane 2 mocks Stripe; Lane 3 plays placeholder media. Every lane demos against fakes until integration day.
- **Trunk-based git.** Short-lived feature branches, small PRs; the pre-commit hooks (gitleaks + lint-staged) run on every commit.
- **No lane owns another lane's directory.** Cross-lane changes go through a PR with the owning lane reviewing.
- **Integration checkpoints.** Aim for: proofs flow through clearing (Lane 1 × 2), bids drive the stream (Lane 2 × 3), and proof receipts display in the listener client (Lane 1 × 3) — before polishing animations.

## Day 1 contract-freeze checklist

Before anyone writes feature code, confirm all of the following against `packages/shared/src/index.ts`:

- [ ] `PublicChallenge` excludes `answer` — no challenge answer crosses the WebSocket.
- [ ] Redis topic names and publisher/consumer ownership are fixed (Lane 2 publishes marketplace events, Lane 3 publishes runtime events).
- [ ] Every `WsEvent` type has exactly one authoritative emitter (see source-of-truth above).
- [ ] A versioned demo fixture (hardcoded `WsEvent` sequence) can drive the whole UI without API or contract availability.
- [ ] The shared contract runs a typecheck in CI (`pnpm --filter @slopstream/shared build` passes).
- [ ] `AttentionProofReceipt` is issued through Lane 2's API (Lane 1 verifies, Lane 2 stores and returns the receipt), not directly from Lane 1 to Lane 3.

## Sequencing risk

Lane 3 has the most surface area and everything demos through it — it should start the big screen and listener client on day one, even against hardcoded data. Lanes 1 and 2 can be a day behind on integration without hurting the demo, but Lane 3 cannot.

P0 priorities per lane are in the [build order](build-order.md).
