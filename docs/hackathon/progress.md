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
  - `parseVerificationRequest` structurally validates the full `{ submission,
context }` request.
  - `createStubAttentionProofVerifier` checks listener/segment/challenge
    binding, challenge timing (issue + submission within the window), and
    rejects reused nonces (in-memory).
  - `createServerStubAttentionProof` in `packages/shared` gives Lane 2 the
    canonical server-issued demo payload to create only after it privately
    grades a correct answer.
  - `VERIFIER_MODE=stub` is read at startup; unsupported modes, including
    `midnight`, fail fast rather than mislabeling the JSON stub.
  - Returns `AttentionProofVerificationResult` with `verifierMode: "stub"`,
    a SHA-256-derived `proofId`, and failure codes matching
    `AttentionProofVerificationFailure`.
  - `GET /health`, `POST /v1/attention-proofs/verify`.
  - Optional `VERIFIER_API_TOKEN` bearer authentication protects the
    Lane 2 → Lane 1 verification endpoint; comparison is timing-safe.
  - The remote API adapter fails fast without `PROOF_VERIFIER_URL`, forwards
    the optional shared token, and rejects malformed successful responses.
- **Stub generator** (`apps/generator/`) — HTTP service accepting
  `GenerationRequest` and returning a valid `GenerationResult`:
  - Runtime validation includes required `segmentId`.
  - Lane 2 allocates the canonical segment ID when it realizes a winner; the
    caller supplies it and the generator echoes it rather than minting one.
  - Tier-appropriate placeholder asset URLs.
  - `GenerationProvider` and `GenerationJobStore` seams: the local
    `StubGenerationProvider` and `InMemoryGenerationJobStore` can be replaced
    by Daytona/model providers and durable job storage without changing the
    HTTP request/result contract.
  - `GET /health`, `POST /v1/generations`: 201 for a new canonical segment,
    200 for an identical retry, 409 for conflicting reuse of a segment ID,
    and 400 for invalid input.
- **Shared types** — `AttentionProofSubmission`,
  `AttentionProofVerificationContext`, `AttentionProofVerificationRequest`,
  `AttentionProofVerificationResult`, `AttentionProofVerificationFailure`,
  `StubAttentionProofPayload`, and `createServerStubAttentionProof` all
  defined in `packages/shared`.

### Lane 1: stubbed / not yet implemented

- **Midnight Compact contracts** — all four `.compact` files
  (`ProofOfAttention`, `BidClearing`, `RewardClearing`,
  `PreviewRightsThreshold`) are comment-only interface sketches. No Compact
  toolchain, no compilation, no on-chain logic.
- **Midnight verifier mode** — type support exists in shared, but selecting it
  is intentionally rejected until a real verifier is installed.
- **Daytona generation pipeline** — the provider/job interfaces exist, but
  the implementation still uses `StubGenerationProvider`; no LLM/TTS/image/
  video provider, sandbox, asset upload, or durable job store is configured.
- **Scraper** — no `ScrapedCompany` ingestion for free-ad cold start.

### Lane 1: known handoffs and inconsistencies

- **Lane 2 verifier adoption — resolved** — `RemoteProofVerifier` sends the
  complete `AttentionProofVerificationRequest`, including context, and issues
  the stub attestation server-side via `createServerStubAttentionProof` only
  after privately grading the answer. The browser never constructs the
  attestation.
- **Receipt provenance — resolved** — Lane 2's API retains and returns
  `AttentionProofVerificationResult.verifierMode` on receipts so the UI can
  label stub and Midnight receipts truthfully.
- **Real local verifier handoff — resolved** — an integration test exercises
  `POST /attention-proofs` → `RemoteProofVerifier` → authenticated verifier
  HTTP service → persisted attention event and public aggregate event. A wrong
  answer remains inside Lane 2 and produces no `attention.verified` event.
- **Generator preparation handoff — resolved at the service level** —
  `SegmentPreparationService` performs `generating → generator → ready →
challenge-source`, verifies the returned canonical segment ID, and posts
  `failed` when generation cannot complete. Scheduler/queue ownership remains
  Lane 3.
- **Contract/shared naming drift — resolved.** `BidClearing.compact` now uses
  `amountUsd`/`slot` (matching shared `Bid`); `RewardClearing.compact` now uses
  `bidId`/`eligibleAmountUsd` (matching shared `RewardPool`).
- `ProofOfAttention.compact` doesn't model `AttentionProofVerificationContext`
  (timing facts) — those are validated outside the contract by the stub.

### Lane 1: next steps

1. Wire the Compact compiler/runtime, network/deployment configuration, and a
   witness/nullifier design; then implement and test `ProofOfAttention.compact`
   before enabling Midnight mode.
2. Replace the process-local verifier nonce set and generation job store with
   durable shared storage before more than one service instance is used.
3. Choose and configure Daytona/model/asset providers, then implement a real
   `GenerationProvider` behind the existing request/result contract.
4. Have the Lane 3 scheduler invoke `SegmentPreparationService` against live
   API and generator services, then verify the full playback/window-close path.
5. Build the scraper for free-ad cold start.

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
  `bid.outbid`, `leaderboard.updated`. `AuctionState.winner` carries the
  realized `segmentId` so Lane 3 can bind winner → segment.
- **Clearing engine** (`clearing.ts`) — attention window management,
  one-shot threshold clearing, 80/20 split with Hamilton largest-remainder
  distribution. Emits `attention.verified`, `bid.cleared`, `bid.uncleared`,
  `bid.failed`, `reward.pool.updated`.
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
  `activeChallenge` only surfaces a challenge inside its answerable
  `[validFrom, validUntil]` window.
- **Lane 1 verifier integration** (`verifier.ts`) — Lane 2 privately grades
  the listener's answer against the backend-held challenge in both verifier
  modes; the browser never constructs the attestation. On a correct answer,
  `RemoteProofVerifier` issues the attestation server-side via shared
  `createServerStubAttentionProof` (fresh nonce) and forwards the complete
  `AttentionProofVerificationRequest` — submission plus full
  `AttentionProofVerificationContext` — to Lane 1's verifier. Proof receipts
  carry `verifierMode` provenance from the verification result. Verified
  live against `apps/verifier` (see cross-lane table).
- **Lifecycle event publication + grace close** (`routes.ts`) — the segment
  lifecycle endpoints now publish `segment.generating`, `segment.ready`,
  `segment.playing`, and `challenge.fired` on the marketplace bus, so the
  live flow works before Lane 3's orchestrator emits on the `runtime` topic
  (once it does, these publications come out — one emitter per event).
  `POST /segments/:id/window-closed` defers the clearing evaluation by
  `WINDOW_GRACE_SEC` so in-flight proofs still land; exactly-once is
  preserved (duplicate close → 409), and `/failed` cancels a pending close.
- **Money** (`money.ts`) — integer-cents arithmetic, `splitCents`, `ApiError`.
- **Test suite** — 30 passing Vitest tests: money math (cents round-trip,
  `splitCents`, largest-remainder distribution), auction economics
  (reservation, outbid release, close/refund/reopen), clearing rules
  (threshold freeze, replay rejection, out-of-window rejection,
  failed-segment refund), authorization/lifecycle behavior, and the real
  API-route → remote verifier HTTP integration.
- **Demo brand seeding** — 3 brands with $500 each on startup. ACME uses the deterministic `brand_acme` ID and `DEMO_ACME_BRAND_TOKEN` only in the explicit hackathon demo profile; mutation routes still require that bearer token.

### Lane 2: stubbed / not yet implemented

- **Persistence** — `Ledger` is in-memory Maps. No Postgres adapter, no
  migrations. `DATABASE_URL` is decorative.
- **Stripe** — top-ups are instant mock credits. No checkout, no webhooks.
- **Anti-fraud** — `uniquenessScore` hard-coded to `1`.

### Lane 2: known inconsistencies

1. `visualMetadata`/`audioMetadata` in `ChallengeSourceCommand` are accepted
   but ignored; challenges derive from transcript only.

Resolved since the last review: the listener commitment now rides in the
server-issued attestation (old #1), the remote verifier receives the full
`AttentionProofVerificationContext` (old #2), `verifierMode` provenance is
surfaced on receipts (old #3), `activeChallenge` checks the full
`[validFrom, validUntil]` window (old #5), `failSegment` emits the new
`bid.failed` event (old #4), lifecycle endpoints publish their events and
`WINDOW_GRACE_SEC` defers the clearing evaluation.

### Lane 2: next steps

1. Add Postgres adapter (post-hackathon).
2. Remove the lifecycle-event publication from `routes.ts` once Lane 3's
   orchestrator emits `segment.*`/`challenge.fired` on the `runtime` topic
   (one emitter per event).

---

## Lane 3: Stream & Experience

**Owner scope:** everything the audience and judges see — big screen, listener
client, brand console, demo harness, WebSocket gateway, orchestrator.

### Lane 3: implemented

- **First visual overhaul (2D, done)** — the big screen, listener, and brand
  surfaces were rebuilt from their initial basic versions into a dynamic,
  audio-reactive, animated experience using Framer Motion + Canvas 2D + Web
  Audio. This is the baseline that the 3D overhaul builds on. Key additions:
  - `useAudioSignal` — shared audio signal hook (synthesized in demo mode,
    ready for a real `AnalyserNode` in live mode). All visual surfaces
    subscribe to this ref at 60fps.
  - `useSoundDesign` — Web Audio synthesized sounds (OUTBID crack, clearing
    chime, challenge pop, proof seal, bid click, join sweep).
  - `AmbientCanvas` — full-bleed Canvas 2D particle layer with drifting
    brand-tinted metaball blobs, audio-reactive swelling, beat ripples,
    OUTBID burst particles.
  - `SoftBlob` / `BlobChip` — SVG soft-body blob chips with Catmull-Rom
    spline paths that wobble and deform with the audio signal.
  - `LiquidThreshold` — canvas-rendered sloshing liquid with wave physics.
  - `ClearBurstFlow` — flowing particle streams with trails (80/20 split).
  - Full-bleed now-playing with audio-reactive background canvas, spatial
    depth (receding segment ghosts), floating leaderboard over the canvas.
  - Listener: full-bleed audio-reactive background, sound on challenge/proof.
  - Brand: ambient brand glow canvas, sound on OUTBID/bid, particle effect
    on bid confirmation, glassmorphic cards, living leaderboard.
- **Big screen** (`/screen`) — the living canvas (2D version):
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
  - Proof receipt (the calm center): translucent white card, result-specific
    seal, proof hash typing plus full selectable proof ID, reward counting for
    verified results only, and provenance that says “Verified in demo mode”
    for the JSON stub or “Verified by Midnight” only for a real Midnight
    receipt; auto-dismisses after 3.5s.
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
- **Live bid placement** — in live hackathon mode the brand console reads the
  explicitly demo-only ACME bearer token, loads `/brands/me/balance`, and
  posts authenticated bids. It is not production brand authentication.

### Lane 3: known inconsistencies

- **`brandId` on segment events — resolved.** `segment.generating` and
  `segment.playing` now carry `brandId` in `packages/shared`. The reducer
  reads it directly; the per-slot leader inference (`updateSlotLeaders` /
  `_slotLeaders`) has been removed. Lane 2's lifecycle routes populate
  `brandId` from the segment's brand; the demo fixture populates it per
  scene.
- **No Tailwind** — used CSS variables + inline styles + Framer Motion
  instead. The design-language doc lists Tailwind as P0, but the per-brand
  dynamic color system maps more naturally to CSS custom properties. Can be
  added later without rewriting the color system.

### Lane 3: next steps

1. **3D visual overhaul — Phases 4–9.** Phases 1–3 are live (ray-marched
   metaball fluid shader, audio → uniforms, Rapier physics brand blobs with
   a manual critically-damped spring, OUTBID color flood + velocity kick,
   error boundary → Canvas 2D fallback, `dpr` capped at 1). Remaining:
   ad surface tier evolution (Phase 4), 3D threshold basin + clearing
   streams (Phase 5), `ProofReceipt3D` (Phase 6), mesh fallback +
   capability detection (Phase 7), listener/brand refinement (Phase 8),
   generation pipeline (Phase 9). See
   [3D overhaul plan](./3d-overhaul-plan.md) for the status table and
   Phase 3 implementation notes.
2. Wire the orchestrator: HTTP/WS gateway, Redis subscription, auction
   polling, generator calls, segment scheduling, event emission on the
   `runtime` topic.
3. Swap the visualizer's simulated amplitude for a real `AnalyserNode`.
4. Integration test: set `NEXT_PUBLIC_STREAM_MODE=live` and verify all three
   surfaces consume the real API + WebSocket feed.
5. Wire the real generation pipeline (TTS, image gen, video gen) after the 3D
   world is stable. API keys provided by the user when ready.

---

## Cross-lane integration status

| Integration point                | Status                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Shared types (`packages/shared`) | Frozen — all three lanes code against it                                                                                             |
| Demo fixture → UI                | Working (Lane 3 owns player + fixture)                                                                                               |
| Lane 2 API → Lane 1 verifier     | Working — authenticated remote handoff is covered by a real API-route → verifier HTTP integration test                               |
| Lane 2 API → UI (live mode)      | Ready in UI (`useLiveStream`); gateway runtime is owned by Lane 3                                                                    |
| Orchestrator → generator         | `SegmentPreparationService` is implemented; scheduler invocation remains Lane 3 work                                                 |
| Orchestrator → Lane 2 auction    | Preparation accepts the canonical winner; auction polling/scheduling remains Lane 3 work                                             |
| Orchestrator → WebSocket gateway | Not wired                                                                                                                            |
| Proof receipt end-to-end         | Working in live mode (server-issued stub attestation, `verifierMode` provenance on receipts); Midnight mode pending Lane 1 contracts |

## What demos today

The demo-mode harness drives all three surfaces end-to-end with no backend:

- Big screen plays the 8-scene fixture with all signature visuals (2D
  version — audio-reactive ambient canvas, soft-body blob leaderboard, liquid
  threshold, flowing clearing streams, synthesized sound design). The 3D
  fluid world overhaul is the next priority (see
  [3D overhaul plan](./3d-overhaul-plan.md)).
- Listener client renders challenges + proof receipts from canned data.
- Brand console shows live auction pressure from the fixture.

Setting `NEXT_PUBLIC_STREAM_MODE=live` + `NEXT_PUBLIC_API_BASE_URL` switches
all three surfaces to consume the real API + WebSocket gateway when ready —
zero code changes to the components. The listener creates/resumes an anonymous
session in `sessionStorage`; the demo brand console additionally requires the
explicitly demo-only `NEXT_PUBLIC_DEMO_BRAND_TOKEN`.
