# Progress — Per-Lane Status

Snapshot of all three lanes as of the latest review. Each lane lists what's
implemented, what's stubbed, known inconsistencies, and next steps.

## Current experience baseline (2026-08-30)

**Product direction (2026-08-30):** Phase 1 north star is the free Continuum — immersive, unbroken, enjoyable — not the auction marketplace. Recent plumbing: overdue auction sweep, demo scraped seed, scheduler prefetch. **Launch simplification (2026-08-30):** removed web demo mode (`demoFixture`, `NEXT_PUBLIC_STREAM_MODE`); the Continuum lives at `/` (`/screen` redirects for legacy links); all surfaces use the live gateway only.

This is a chronological implementation log, so older entries below describe
the superseded 3D fluid-world prototype. The current product baseline is the
HTML/CSS **Continuum**: a colourful central media portal, persistent archive
fragments, oversized typography, spheres and event ripples. The public stream
snapshot keeps the eight newest completed segments so that visual continuity
survives reconnects. Challenges are available only after a listener explicitly
enables **Earn Mode**; passive listening remains uninterrupted. See the
[design language](../product/design-language.md) for the authoritative UI
specification and the [archived 3D decision record](3d-overhaul-plan.md) for
the previous direction.

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
- **ElevenLabs generation provider** (`apps/generator/src/elevenlabsProvider.ts`)
  — a full `GenerationProvider` that generates real ad content via the
  ElevenLabs API:
  - TTS via `textToSpeech.convert` — model configurable via
    `ELEVENLABS_TTS_MODEL` (defaults to `eleven_flash_v2_5` for cost;
    `eleven_v3` for expressive delivery).
  - Image generation via `flows.image` with `gemini-3-pro-image`
    (audio_image tier).
  - Video generation via `flows.video` with `veo-3.1-fast-generate-001`
    (video + premium tiers).
  - Spend mitigation via `ELEVENLABS_MAX_TIER` — caps the generation tier,
    downgrading higher tiers to the cap. Set to `audio` to skip image/video
    generation entirely (TTS-only, cheapest path).
  - Template-based ad script generation from the brand brief (no separate
    LLM API key needed).
  - Assets saved locally and served by the generator's `/assets/` static
    route (CORS-enabled).
  - `GENERATOR_MODE=elevenlabs` activates it; lazily imported to avoid
    loading the SDK in other modes.
- **Static asset serving** (`apps/generator/src/server.ts`) — the generator
  now serves generated assets at `GET /assets/:key` with correct content
  types, CORS headers, and path traversal protection.
- **Shared types** — `AttentionProofSubmission`,
  `AttentionProofVerificationContext`, `AttentionProofVerificationRequest`,
  `AttentionProofVerificationResult`, `AttentionProofVerificationFailure`,
  `StubAttentionProofPayload`, and `createServerStubAttentionProof` all
  defined in `packages/shared`.
- **Real Midnight contract** (`contracts/src/ProofOfAttention.compact`) —
  compiled with `compactc 0.31.1` (Compact 0.23 / runtime 0.16.0, matched to
  the Midnight preprod testnet). Nullifier-based replay protection
  (`persistentHash` of an ephemeral `listenerSecret` witness + segmentId +
  challengeId), public `verifiedCount` counter, and a threshold flag that
  flips when enough verified attention lands. Segment/challenge binding is
  proven in-circuit and never disclosed on-chain. Artifacts (TS bindings,
  zkir, prover/verifier keys) committed under
  `packages/midnight/contract/src/managed/proofofattention`.
- **Midnight SDK stack** (`packages/midnight/`) — full provider wiring for
  preprod: LevelDB private state, indexer public data, node zk-config,
  remote proof server (`httpClientProofProvider`), testkit wallet with
  faucet auto-funding and tDUST generation. Scripts: `deploy` (fund + dust
  - deploy, prints wallet seed + contract address), `state` (read ledger),
  `submit-proof` (smoke-test a circuit call). The listener secret is
  rotated to fresh randomness in private state before every submission.
- **Midnight verifier mode** (`apps/verifier/src/midnightVerifier.ts`) —
  `VERIFIER_MODE=midnight` joins the deployed contract and records each
  structurally valid proof on-chain via `submitAttentionProof`, returning
  `verifierMode: "midnight"` with `proofId = midnight_<nullifier>`. On-chain
  failure surfaces as `recording_failed`; startup fails fast without
  `MIDNIGHT_WALLET_SEED` + `PROOF_OF_ATTENTION_CONTRACT_ADDRESS`.

### Lane 1: stubbed / not yet implemented

- **Settlement contracts** — `BidClearing`, `RewardClearing`, and
  `PreviewRightsThreshold` remain comment-only interface sketches. Only
  `ProofOfAttention` is compiled and deployable.
- **Preprod deployment** — the contract, SDK stack, and midnight verifier
  mode are wired and tested offline; the live deployment to Midnight preprod
  needs a running proof server (`midnightntwrk/proof-server:8.0.3`, planned
  on the team VPS behind an SSH tunnel) plus faucet funds.
- **ProofOfAttention timing facts** — challenge timing windows are still
  validated off-chain by the verifier; the contract proves segment/challenge
  binding and replay protection only.
- **Daytona generation pipeline** — the provider/job interfaces exist, but
  the Daytona sandbox path is not yet configured. The ElevenLabs direct
  mode (`GENERATOR_MODE=elevenlabs`) provides real TTS/image/video
  generation without a sandbox. A durable job store (beyond
  `InMemoryGenerationJobStore`) is not yet wired.
- **Scraper** — `CompanyScraper` is wired in the orchestrator
  (`apps/orchestrator/src/index.ts`); when `PARALLEL_API_KEY` is set it
  periodically queries the Parallel Search API for newly launched companies
  and ingests them into the API's free-ad queue. Without the key the scraper
  is disabled and the stream falls back to the demo fixture.

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

1. ~~Wire the Compact toolchain and implement `ProofOfAttention.compact`~~ —
   done; remaining: run the proof server on the VPS, deploy to preprod, and
   smoke-test with `submit-proof`.
2. Replace the process-local verifier nonce set and generation job store with
   durable shared storage before more than one service instance is used.
3. Choose and configure Daytona/model/asset providers, then implement a real
   `GenerationProvider` behind the existing request/result contract.
4. Have the Lane 3 scheduler invoke `SegmentPreparationService` against live
   API and generator services, then verify the full playback/window-close path.
5. ~~Build the scraper for free-ad cold start.~~ — done; `CompanyScraper` is
   wired and active when `PARALLEL_API_KEY` is set.

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
  lifecycle endpoints publish `segment.generating`, `segment.ready`,
  `segment.playing`, and `challenge.fired` on the marketplace bus, gated by
  `PUBLISH_LIFECYCLE_EVENTS` (default on). In live mode the flag is set to
  `0` so Lane 3's orchestrator is the sole emitter of the runtime events —
  exactly one emitter per `WsEvent` either way.
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
2. Lifecycle-event publication is now flag-gated (`PUBLISH_LIFECYCLE_EVENTS`);
   the live stack runs with it `0` so the orchestrator is the sole runtime
   emitter. The code path can be deleted once the orchestrator is the only
   supported live configuration.

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
- **Big screen** (`/`) — the living canvas (2D version):
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
- **Orchestrator** (`apps/orchestrator/`) — the live brain, implemented and
  verified end-to-end:
  - `Gateway` — single HTTP + WS server on :4200. Owns ONE monotonic
    sequence space: every `WsDelivery` broadcast is stamped with the
    gateway's own sequence, and `GET /stream/snapshot` overwrites the API's
    `asOfSequence` with it, so `useLiveStream`'s gap detection sees exactly
    one space. Recent deliveries (ring of 256) replay on connect so late
    joiners miss nothing. Everything else is reverse-proxied to the API
    (method/path/query/body, `content-type` + `authorization` forwarded,
    CORS + OPTIONS handled locally).
  - `MarketplaceFeed` — polls `GET /events?after=<cursor>` every 750ms and
    re-emits API deliveries (bid.*, attention.verified, clearing, reward,
    stats) through the gateway with their original `eventId`. A backwards
    sequence jump (API restarted) resets the cursor and replays; clients
    dedupe by `eventId`.
  - `SegmentScheduler` — polls `GET /auctions/current` every 2s; for the most
    recently closed slot it drives the full lifecycle against Lane 2:
    `/generating` → generator call (concurrent with four
    `generation.progress` beats) → `/ready` → `/challenge-source` →
    `/playing` → pull-ahead `challenge.fired` loop → `/window-closed`. It is
    the sole emitter of `segment.generating`, `generation.progress`,
    `segment.ready`, `segment.playing`, and `challenge.fired` when the API
    runs `PUBLISH_LIFECYCLE_EVENTS=0`. Compressed playback:
    `SEGMENT_PLAY_SEC` (default 20) is the window timeline sent to both
    `/ready` and `/challenge-source`. On any drive failure it calls
    `/failed` (Lane 2 refunds + emits `bid.failed`) and survives; on restart
    it adopts an in-flight `nowPlaying` instead of re-driving settled slots.
  - Continuity: the scheduler keeps the last ≤2 segment summaries and passes
    them as `GenerationRequest.previousSummaries`. It also tracks the last
    segment's hero image URL (`continuityImageUrl`) and snapshots live market
    pressure into `GenerationRequest.marketContext` before each generator call.
  - Ops HUD: `GET /ops/metrics` on the gateway returns `StreamOpsMetrics`
    (generation latency, playback, queue depth, at-risk flag). The brand
    console can poll it when `NEXT_PUBLIC_OPS_HUD=1`.
  - 20 passing Vitest tests across cursor logic, market context helpers, ops
    metrics route, a full fake-Lane-2 + fake-generator end-to-end drive
    through one gateway sequence space, the dead-generator failure path, and
    proxy/auth forwarding.

### Lane 3: stubbed / not yet implemented

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

1. **Continuum refinement.** The shipped screen is the colourful media world
   described in the [design language](../product/design-language.md): improve
   its content diversity, asset quality and deterministic recipes as new
   formats arrive. The earlier 3D experiment is retained only as an
   [archived reference](./3d-overhaul-plan.md).
2. ~~Wire the orchestrator~~ — done (gateway + feed + scheduler, see
   implemented). Follow-ups: Redis subscription as an optional fast path
   (polling stays as the correctness layer), and durable state if more than
   one orchestrator instance is ever needed.
3. Swap the visualizer's simulated amplitude for a real `AnalyserNode`.
4. ~~Integration test: `NEXT_PUBLIC_STREAM_MODE=live`~~ — verified live:
   with all five services running, the full loop (bid → auction close →
   generation → playback → challenge answer → remote verification →
   threshold clear → `bid.cleared` + 80/20 reward) runs through the gateway
   with zero UI changes.
5. ~~Wire the real generation pipeline (TTS, image gen, video gen)~~ — done;
   the ElevenLabs provider is wired with spend-mitigation env vars
   (`ELEVENLABS_TTS_MODEL`, `ELEVENLABS_MAX_TIER`). Initial testing uses
   `eleven_flash_v2_5` TTS with tier capped at `audio`; raise the cap to
   unlock image/video generation.

---

## Cross-lane integration status

| Integration point                | Status                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------                      |
| Shared types (`packages/shared`) | Frozen — all three lanes code against it                                                                                                                  |
| Demo fixture → UI                | Working (Lane 3 owns player + fixture)                                                                                                                    |
| Lane 2 API → Lane 1 verifier     | Working — authenticated remote handoff is covered by a real API-route → verifier HTTP integration test                                                    |
| Lane 2 API → UI (live mode)      | Working — all three surfaces consume the API through the gateway's reverse proxy + WS feed                                                                |
| Orchestrator → generator         | Working — scheduler calls `POST /v1/generations` directly; generation failure → `/failed` → `bid.failed` + refund                                         |
| Orchestrator → Lane 2 auction    | Working — polls `GET /auctions/current` + `GET /auctions/:slot`, drives the full lifecycle                                                                |
| Orchestrator → WebSocket gateway | Working — same process; sole emitter of the five runtime event types when the API runs `PUBLISH_LIFECYCLE_EVENTS=0`                                       |
| Proof receipt end-to-end         | Working in live mode (server-issued stub attestation, `verifierMode` provenance on receipts); Midnight mode fully wired — pending the live preprod deploy |

## What demos today

Two full paths, sharing the exact same UI code:

- **Live mode (the P0 slice)** — with verifier (:4100), generator (:4300,
  `GENERATOR_MODE=elevenlabs`), API (:4000, `PROOF_VERIFIER_MODE=remote`,
  `PUBLISH_LIFECYCLE_EVENTS=0`), orchestrator (:4200, optional
  `PARALLEL_API_KEY` for cold-start scraping), and web (:3000,
  `NEXT_PUBLIC_STREAM_MODE=live`) running, the real loop plays: a brand bids
  from `/brand`, the auction closes, the orchestrator generates through the
  ElevenLabs provider (real TTS, optional image/video), the ad plays on
  `/` with brand tint, a listener on `/listen` answers a real
  challenge, the proof verifies through `apps/verifier`, the attention
  threshold clears the bid with the 80/20 reward split, and the next auction
  opens. Kill the generator mid-flight and the bid fails gracefully with a
  refund. Spend is mitigated via `ELEVENLABS_MAX_TIER` (cap at `audio` for
  TTS-only) and `ELEVENLABS_TTS_MODEL` (defaults to `eleven_flash_v2_5`).
- **Demo mode (the insurance policy)** — the demo-mode harness drives all
  three surfaces end-to-end with no backend:

- Big screen plays the 8-scene fixture as a Continuum media world — central
  portal, recipe-driven archive fragments, colourful spheres, typography,
  event ripples, proof receipt and synthesized sound design.
- Listener client renders challenges only in explicit Earn Mode, plus proof
  receipts from canned data.
- Brand console shows live auction pressure from the fixture.

Setting `NEXT_PUBLIC_STREAM_MODE=live` + `NEXT_PUBLIC_API_BASE_URL` switches
all three surfaces to consume the real API + WebSocket gateway when ready —
zero code changes to the components. The listener creates/resumes an anonymous
session in `sessionStorage`; the demo brand console additionally requires the
explicitly demo-only `NEXT_PUBLIC_DEMO_BRAND_TOKEN`.
