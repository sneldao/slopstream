# Progress — Per-Lane Status

Snapshot of all three lanes as of the latest review. Each lane lists what's
implemented, what's stubbed, known inconsistencies, and next steps.

---

## Lane 1: Contracts & Clearing

**Owner scope:** on-chain trust layer — Midnight contracts, proof verifier,
generation pipeline.

### Lane 1: implemented

- **JSON-stub proof verifier** (`apps/verifier/`) — a working HTTP service
  that validates `AttentionProofVerificationRequest` payloads:
  - `parseVerificationRequest` structurally validates the request.
  - `createStubAttentionProofVerifier` checks listener/segment/challenge
    binding, challenge timing (issue + submission within the window), and
    rejects reused nonces (in-memory).
  - Returns `AttentionProofVerificationResult` with `verifierMode: "stub"`,
    a SHA-256-derived `proofId`, and failure codes matching
    `AttentionProofVerificationFailure`.
  - `GET /health`, `POST /v1/attention-proofs/verify`.
- **Stub generator** (`apps/generator/`) — HTTP service accepting
  `GenerationRequest` and returning a valid `GenerationResult`:
  - Runtime validation of `brandId`, `brief`, `tier`, `previousSummaries`.
  - Tier-appropriate placeholder asset URLs.
  - `GET /health`, `POST /v1/generations` (201 on success, 400 on invalid).
- **Shared types** — `AttentionProofSubmission`,
  `AttentionProofVerificationContext`, `AttentionProofVerificationRequest`,
  `AttentionProofVerificationResult`, `AttentionProofVerificationFailure`,
  `StubAttentionProofPayload` all defined in `packages/shared`.

### Lane 1: stubbed / not yet implemented

- **Midnight Compact contracts** — all four `.compact` files
  (`ProofOfAttention`, `BidClearing`, `RewardClearing`,
  `PreviewRightsThreshold`) are comment-only interface sketches. No Compact
  toolchain, no compilation, no on-chain logic.
- **Daytona generation pipeline** — `generate()` returns stub content; no
  LLM/TTS/image/video providers, no sandbox, no real assets.
- **Scraper** — no `ScrapedCompany` ingestion for free-ad cold start.
- **`VERIFIER_MODE` env var** — defined in `.env.example` but not read; the
  service always runs in stub mode.
- **`midnight` verifier mode** — type exists in shared but no implementation.

### Lane 1: known inconsistencies

- `BidClearing.compact` uses `amount`/`segmentSlot`; shared `Bid` uses
  `amountUsd`/`slot`. Contract parameter names should align before
  implementation.
- `RewardClearing.compact` uses `rewardAmount`; shared `RewardPool` uses
  `grossAmountUsd`/`eligibleAmountUsd`.
- `ProofOfAttention.compact` doesn't model `AttentionProofVerificationContext`
  (timing facts) — those are validated outside the contract by the stub.

### Lane 1: next steps

1. Wire the Compact toolchain; implement `ProofOfAttention.compact` and
   `BidClearing.compact` (P0).
2. Add a `midnight` verifier mode that switches on `VERIFIER_MODE`.
3. Wire Daytona + model providers into `generate()`.
4. Build the scraper for free-ad cold start.

---

## Lane 2: Money & Marketplace

**Owner scope:** backend ledger, auction economy, challenge engine, API,
live-event bus.

### Lane 2: implemented

- **Full HTTP API** (`apps/api/`) — 20 endpoints across auction, market,
  clearing, snapshot, and orchestrator lifecycle:
  - `POST /brands`, `GET /brands/me/balance`, `POST /top-ups` (mock Stripe).
  - `POST /bids` with first-price open ascending auction.
  - `POST /listener-sessions`, `GET /listener-sessions/me`.
  - `POST /attention-proofs` → proof verification → `attention.verified`.
  - Segment lifecycle: `generating`, `ready`, `challenge-source`,
    `challenges/next`, `playing`, `window-closed`, `failed`.
  - Auction reads: `GET /auctions/current`, `GET /auctions/:slot`,
    `POST /auctions/current/close`.
  - `GET /stream/snapshot`, `GET /events` (replay).
- **Auction engine** (`auction.ts`) — bid placement, outbid detection, fund
  reservation, winner selection, slot realization. Emits `bid.placed`,
  `bid.outbid`, `leaderboard.updated`.
- **Clearing engine** (`clearing.ts`) — attention window management,
  one-shot threshold clearing, 80/20 split with Hamilton largest-remainder
  distribution. Emits `attention.verified`, `bid.cleared`, `bid.uncleared`,
  `reward.pool.updated`.
- **Challenge engine** (`challenges.ts`) — generates `recall`, `true_false`,
  `sequence` challenges from transcript text. `PublicChallenge` projection
  strips answers.
- **Market service** (`market.ts`) — brand accounts, mock-Stripe top-ups,
  listener sessions.
- **Ledger** (`ledger.ts`) — in-memory store shaped like the Postgres schema
  (10 tables: brands, balances, bids, segments, challenges, sessions,
  attention_events, reward_pools, listener_rewards, auctions).
- **Event bus** (`bus.ts`) — wraps `WsEvent` into `WsDelivery` with
  `eventId` + monotonic `sequence`. Redis publisher when `REDIS_URL` is set;
  in-process fallback otherwise. Publishes to `REDIS_TOPICS.marketplace`.
- **Snapshot** (`snapshot.ts`) — composes `StreamSnapshot` from ledger +
  engines. Maps `mediaUrl` → `assetUrl`, `durationSec` → `durationSeconds`.
- **Money** (`money.ts`) — integer-cents arithmetic, `splitCents`, `ApiError`.
- **Demo brand seeding** — 3 brands with $500 each on startup.

### Lane 2: stubbed / not yet implemented

- **Persistence** — `Ledger` is in-memory Maps. No Postgres adapter, no
  migrations. `DATABASE_URL` is decorative.
- **Stripe** — top-ups are instant mock credits. No checkout, no webhooks.
- **`WINDOW_GRACE_SEC`** — loaded from env but not applied; windows close
  exactly when `/window-closed` is called.
- **Anti-fraud** — `uniquenessScore` hard-coded to `1`.
- **Orchestrator events not published** — segment lifecycle endpoints
  (`generating`, `ready`, `playing`, `challenge.fired`) set state but don't
  call `bus.publish`. These are expected to be emitted on the `runtime`
  topic by the orchestrator (Lane 3), but no bridging code exists yet.
- **No tests.**

### Lane 2: known inconsistencies

1. `POST /attention-proofs` validates `listenerCommitment` is a string but
   doesn't forward it to the verifier.
2. `RemoteProofVerifier` sends only `validFrom`/`validUntil`, not the full
   `AttentionProofVerificationContext` (`segmentStartedAt`, `submittedAt`).
3. `verifierMode` from `AttentionProofVerificationResult` is not surfaced in
   the receipt.
4. `failSegment()` reuses `bid.uncleared` for failed segments; `BidStatus`
   has `failed` but there's no `bid.failed` event type.
5. `activeChallenge()` in snapshot doesn't check `elapsed >= validFrom` — a
   challenge could appear before it's answerable.
6. `visualMetadata`/`audioMetadata` in `ChallengeSourceCommand` are accepted
   but ignored; challenges derive from transcript only.

### Lane 2: next steps

1. Wire segment lifecycle event publication (either in `routes.ts` or by the
   orchestrator on the `runtime` topic).
2. Send the full `AttentionProofVerificationContext` to the remote verifier.
3. Fix `activeChallenge` timing check.
4. Add Postgres adapter (post-hackathon).
5. Add tests for the auction + clearing math.

---

## Lane 3: Stream & Experience

**Owner scope:** everything the audience and judges see — big screen, listener
client, brand console, demo harness, WebSocket gateway, orchestrator.

### Lane 3: implemented

- **Big screen** (`/screen`) — the living canvas:
  - Brand-tinted radial-gradient backdrop that breathes (CSS variables set
    at runtime from the active brand).
  - OUTBID flash: full-screen color wash from displaced → new leader, splash
    ring ripple, spring-burst "OUTBID" text, new leader + amount.
  - Liquid attention threshold: filling tube with slosh highlight, glows +
    shifts to bright when `verifiedCount >= threshold`.
  - Clearing burst: "$X CLEARED" then two particle streams splitting 80%
    (brand color → listener pool) and 20% (platform accent → Slopstream).
  - Generation sequence: pulsing orb, "GENERATING AD…", stage checkmarks
    (Script/Voice/Image/Video) tinting to brand color as they complete.
  - Leaderboard: floating semi-transparent chips, layout-animated re-sort
    with spring shuffle, leader scales up, amounts pulse on change.
  - Stats footer: count-up numbers via Framer Motion springs.
  - Demo controls: play/pause/step/restart, scene label, progress bar.
- **Listener client** (`/listen`) — mobile game-show experience:
  - Join splash with pulsing orb → auto-join.
  - Audio-reactive visualizer: canvas blob breathing with simulated
    amplitude, tinted to the current brand.
  - Live attention meter: brand-colored fill bar, shifts to bright on
    threshold met.
  - Challenge card: spring pop-in, countdown timer ring (depleting visibly,
    green→yellow→red), large tappable option buttons, haptic vibration.
  - Proof receipt (the calm center): translucent white card, green seal
    stamp rotating in, proof hash typing in character-by-character, reward
    counting up from $0.00, "VERIFIED BY MIDNIGHT" with faint glow,
    auto-dismiss after 3.5s.
  - Balance + today's verified attention tracking.
- **Brand console** (`/brand`) — auction pressure station:
  - OUTBID alert banner (slides in when Acme is overtaken, haptic vibration).
  - Balance + active campaign display.
  - Bid controls: numeric input, "INCREASE TO $X" button in brand gradient,
    insufficient-balance guard.
  - Current winning bid with "(you)" tag, pulses on change.
  - Cost-per-verified-attention estimate with listener/threshold context.
  - Slot countdown timer.
  - Production tier selection (4 tiers from `TIER_BID_THRESHOLDS_USD`).
  - Mini leaderboard with brand-colored borders.
- **Demo harness** — the on-stage insurance policy:
  - `demoFixture.ts` — 8-scene `DemoFixture` matching `demo-script.md`,
    conforming to the shared `DemoFixture`/`DemoStep` contract.
  - `streamReducer.ts` — pure `(state, WsEvent) → StreamState` reducer. The
    single client-side projection; infers per-slot brand leaders from
    `bid.placed`/`bid.outbid` (contract gap: `segment.generating`/`playing`
    don't carry `brandId`).
  - `useDemoPlayer.ts` — walks `DemoFixture.steps` on timers, applies each
    `delivery` through the reducer.
  - `useLiveStream.ts` — live WebSocket client: fetches
    `GET /stream/snapshot`, connects to the gateway, dedupes by `eventId`,
    detects sequence gaps, reconnects with backoff. Same reducer.
  - `useStream.ts` — unified hook picking demo vs live via
    `NEXT_PUBLIC_STREAM_MODE`. All three surfaces call this one hook.
- **Home page** (`/`) — links to all three surfaces with descriptions.

### Lane 3: stubbed / not yet implemented

- **Orchestrator** (`apps/orchestrator/`) — queue-of-one placeholder. No
  HTTP/WS server, no Redis, no auction polling, no generator calls, no event
  emission, no scheduling, no challenge timing.
- **WebSocket gateway** — `useLiveStream` is ready to consume it, but no
  gateway server exists yet. The live hook short-circuits when no API URL is
  configured.
- **Real audio** — the visualizer uses simulated amplitude; no `AnalyserNode`
  wired to a real audio stream.
- **Live bid placement** — the brand console's `placeBidLive` function POSTs
  to `/bids` but is only exercised in live mode.

### Lane 3: known inconsistencies

- **Contract gap flagged to Lanes 1–2:** `segment.generating` and
  `segment.playing` don't carry `brandId`. The reducer infers the per-slot
  leader from `bid.placed`/`bid.outbid`. Recommend adding `brandId` to both
  events in `packages/shared`.
- **No Tailwind** — used CSS variables + inline styles + Framer Motion
  instead. The design-language doc lists Tailwind as P0, but the per-brand
  dynamic color system maps more naturally to CSS custom properties. Can be
  added later without rewriting the color system.

### Lane 3: next steps

1. Wire the orchestrator: HTTP/WS gateway, Redis subscription, auction
   polling, generator calls, segment scheduling, event emission on the
   `runtime` topic.
2. Swap the visualizer's simulated amplitude for a real `AnalyserNode`.
3. Integration test: set `NEXT_PUBLIC_STREAM_MODE=live` and verify all three
   surfaces consume the real API + WebSocket feed.

---

## Cross-lane integration status

| Integration point                | Status                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Shared types (`packages/shared`) | Frozen — all three lanes code against it                                                     |
| Demo fixture → UI                | Working (Lane 3 owns player + fixture)                                                       |
| Lane 2 API → Lane 1 verifier     | Partial (context incomplete — see Lane 2 inconsistencies)                                    |
| Lane 2 API → UI (live mode)      | Ready in UI (`useLiveStream`); gateway not yet built                                         |
| Orchestrator → generator         | Not wired                                                                                    |
| Orchestrator → Lane 2 auction    | Not wired                                                                                    |
| Orchestrator → WebSocket gateway | Not wired                                                                                    |
| Proof receipt end-to-end         | Demo-only (canned receipt); live path needs the full `AttentionProofVerificationContext` fix |

## What demos today

The demo-mode harness drives all three surfaces end-to-end with no backend:

- Big screen plays the 8-scene fixture with all signature visuals.
- Listener client renders challenges + proof receipts from canned data.
- Brand console shows live auction pressure from the fixture.

Setting `NEXT_PUBLIC_STREAM_MODE=live` + `NEXT_PUBLIC_API_URL` switches all
three surfaces to consume the real API + WebSocket gateway when ready — zero
code changes to the components.
