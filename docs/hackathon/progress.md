# Progress — Per-Lane Status

Snapshot of all three lanes as of the latest review. Each lane lists what's
implemented, what's stubbed, known inconsistencies, and next steps.

## Current experience baseline (2026-08-30)

**Product direction (2026-08-30):** Phase 1 north star is the free Continuum — immersive, unbroken, enjoyable — not the auction marketplace. Recent plumbing: overdue auction sweep, demo scraped seed, scheduler prefetch. **Launch simplification (2026-08-30):** removed web demo mode (`demoFixture`, `NEXT_PUBLIC_STREAM_MODE`); the Continuum lives at `/` (`/screen` redirects for legacy links); all surfaces use the live gateway only.

**Frontend hardening (2026-10-19):** `/verify` is a design-system surface now reachable from the nav, sitemap and the phone dock; reduced motion, audio-stall feedback, route boundaries, a11y and the brand typeface are enforced across every surface. Details in Lane 3.

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
  - Spend mitigation on two axes. Per call: `ELEVENLABS_MAX_TIER` caps the
    tier, downgrading anything above it, and **defaults to `audio`** so image
    and video never fire by an omitted env line. Per process:
    `ELEVENLABS_MAX_GENERATIONS` (default 200) refuses once spent — a runaway
    live-generating loop fails closed into encores instead of an open-ended
    invoice. Both are reported on `GET /health` as `cost`. Honest limit: the
    counter is per-process, so the account's plan cap stays the real ceiling.
  - Template-based ad script generation from the brand brief (no separate
    LLM API key needed).
  - Assets are published through `AssetPublisher`: locally under `/assets/`
    for the Coolify demo, or to the authenticated R2 uploader when
    `ASSET_UPLOAD_URL` and `ASSET_UPLOAD_TOKEN` are set.
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
  generation without a sandbox. `SqliteGenerationJobStore` is wired behind
  `GENERATION_JOB_DB_PATH`; the default remains `InMemoryGenerationJobStore`.
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
   done; ~~run the proof server on the VPS~~ — done (nuncio-vultr,
   `midnightntwrk/proof-server:8.1.3` on 127.0.0.1:6300). Remaining: set
   `MIDNIGHT_BLOCKFROST_PROJECT_ID` in `~/slopstream-deploy/deploy.env`
   (Midnight-hosted endpoints decommissioned 2026-10-09), run
   `pnpm --filter @slopstream/midnight deploy:all` to deploy all 3 Wave 3
   contracts, smoke-test with `submit-proof`.
2. Replace the process-local verifier nonce set with durable shared storage
   before more than one verifier instance is used. Generation jobs persist
   when `GENERATION_JOB_DB_PATH` is set; retries/dead-letter and ledger
   durability are still launch work.
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
    (generation latency, playback, queue depth, ready-buffer seconds, at-risk
    flag). `GET /metrics` exposes the same snapshot as Prometheus text. The
    brand console can poll the JSON route when `NEXT_PUBLIC_OPS_HUD=1`.
  - 61 passing Vitest tests across cursor logic, market context helpers, ops
    and Prometheus metrics routes, a full fake-Lane-2 + fake-generator
    end-to-end drive through one gateway sequence space, the dead-generator
    failure path, and proxy/auth forwarding.
- **Frontend hardening pass (2026-10-19)** — the product-critique follow-up, web
  only (`apps/web`); no contract, verifier or deploy file touched:
  - `/verify` rebuilt on the design system — it was an off-brand page with an
    inline dark palette and no header. Now `SphereField` + tokens +
    `SurfaceHeader`, with the pure logic extracted to `lib/verifyProof.ts`
    (8 tests), the contract address allowlisted before it reaches the GraphQL
    query string, deep-link prefill confirmed in a browser, and the page present
    in `SurfaceNav`, `sitemap.ts` and the phone dock.
  - **Reduced motion is now actually enforced.** The design language promised
    it; the canvas and rAF loops ignored it. `lib/useMotionPreference.ts` backs
    every decorative loop (`Scene`, `SoftBlob`, `AmbientGlow`, `WorldPreview`,
    `FullBleedVisualizer`, `AudioVisualizer`) with the _live_ media query, so an
    OS change mid-session stills or resumes the picture without a reload —
    verified by fingerprinting canvas pixels across toggles.
  - **Silent audio failure surfaced** — `PlaybackNotice` ("The stream audio
    stalled. Tap to restore sound") on `/` and `/listen` when playback is
    degraded. `ended` is deliberately not surfaced: a between-segment gap would
    cry wolf every 20 seconds.
  - **Route boundaries** — `error.tsx`, `global-error.tsx`, `not-found.tsx`, so
    a client crash no longer white-screens the stream.
  - **A11y** — `OutbidFlash` announces the overtake in text (the animation is a
    picture, not a reading); decorative emoji and canvases are `aria-hidden`;
    the WorldPreview canvas is `role="img"` labelled with the standings; verify
    inputs carry `aria-invalid` plus a format hint. `StatsFooter` deliberately
    has no live region — `AnimatedNumber` mutates `textContent` at 60fps.
  - **Nav and dock** — dock columns follow the link count (`grid-auto-flow:
column`) instead of a fixed repeat, and Verify is reachable on phones: it
    lived inside the header switcher, which is `display: none` below 720px.
  - **Type** — Archivo self-hosted as `--font-archivo`. The brand face was
    "Avenir Next", which exists only on Apple hardware, so the wordmark rendered
    as Helvetica on Windows, Android and the demo projector. Mobile legibility
    floor for `--t-micro/eyebrow/caption/body` at ≤720px.
  - Brand-palette `setProperty` blocks, duplicated across three surfaces,
    deduped into `useBrandPalette`.
  - Web tests 48 → 61 across 16 files; `pnpm -r test` green; `next build`
    renders 14 static pages.

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
- **Cold "Connecting" on a dead feed — resolved.** The live hook used to
  refuse to fetch at all unless `NEXT_PUBLIC_API_BASE_URL` or
  `NEXT_PUBLIC_WS_URL` was set, and a first snapshot failure scheduled no
  retry, so a misconfigured or single-origin deployment sat on "Connecting to
  the live stream" forever. It now always attempts the snapshot (deriving
  same-origin when unconfigured, the way `gatewayBaseUrl()` already did),
  retries every 1.5s, and labels a never-connected failure honestly: `No
signal` on the big screen (coral, not caution yellow) and "Can't reach the
  live stream" on the listener. `connectionLabel()` is the single decision
  point, tested in `lib/useStream.test.ts`.
- **PWA manifest URLs — resolved.** `manifest.ts` built `start_url` and every
  shortcut `url` from `siteUrl()`, so a deployment whose
  `NEXT_PUBLIC_SITE_URL` differed from the served origin emitted a manifest
  Chrome rejected outright (`start_url` ignored as cross-origin, scope narrowed
  to the document directory, shortcuts dropped for falling outside it, then
  "property 'url' of 'shortcut' not present"). The manifest is origin-relative
  now; `siteUrl()` stays for sitemap/robots/OG, where an absolute URL is the
  requirement.
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
6. **Browser-verify two hardened paths with the full stack up.** `Scene`'s
   reduced-motion gating and a real `PlaybackNotice` stall need a live
   API + orchestrator to appear on screen; both are unit-covered only, because
   the web app renders no canvas at all without stream state.

---

## 2026-10-19 — Blockfrost migration + Wave 3 deploy pipeline

**Network refresh (forced by Midnight):** Midnight decommissioned its hosted
preprod indexer/RPC on 2026-10-09 (`410 ENDPOINT_DECOMMISSIONED` since 10-13).
Blockfrost now serves both; every request needs `?project_id=` auth.
`packages/midnight/src/env.ts` migrated to `midnight-preprod.blockfrost.io` +
`rpc.midnight-preprod.blockfrost.io`, gated by `MIDNIGHT_BLOCKFROST_PROJECT_ID`
with a fail-fast check (`assertMidnightEndpointsConfigured`). The public
`/verify` page reads `NEXT_PUBLIC_BLOCKFROST_MIDNIGHT_PROJECT_ID` (documented
browser-token pattern) or `NEXT_PUBLIC_MIDNIGHT_INDEXER` override.

**Wave 3 contracts shipped (source + compiled artifacts):**
`ProofOfAttention` (verifier-key gate added — closes the documented
not-caller-gated hole), `RewardClearing` (owner-gated pool + per-claim
nullifier window), `PreviewRightsThreshold` (spend commitment + boolean-only
qualification proof). All compiled with pinned `compactc 0.31.1` (language
0.23) into `packages/midnight/contract/src/managed/*` — 10 exported circuits.
`packages/midnight` gained `providersFor(contract)` (one funded wallet,
per-contract private-state stores + zk-config paths) and `deploy:all`, which
writes `contracts/preprod/deployment.json`. Receipts carry `txHash`
end-to-end (verifier → api → shared → UI → `/verify?nullifier=` deep-link).

**Test surface:** `contracts/test/*.test.mjs` — 18/18 zero-install
`node --test` circuit mirrors (domain tags, revert strings, window-shift,
threshold-flip, refusal codes). `JUDGES.md` + `PROOF.md` + `SUBMISSION.md`
written; `midnightntwrk` topic added to the repo.

**Deploy status (nuncio-vultr):** proof-server upgraded to
`midnightntwrk/proof-server:8.1.3` (patches critical GHSA-wr7g-rr4v-jmj8 —
canonical-transcript fix for one-time-check bypass). Wallet funded via manual
faucet claim (tx `002876af…`).

**Deploy diagnosis — resolved (86ab054):** a sync-probe script streaming
facade progress showed the wallet was never wedged on errors — the earlier
`Wallet.Sync` lines were Effect `ParseError` payloads printed as
`[object Object]` from run 1 only. The real blocker: `fundFromFaucetAndWait`
required all three sub-wallets `isStrictlyComplete()`, but shielded + dust
trial-decrypt the full ~1.7M-index preprod history (hours) while unshielded
tx-id sync finishes in ~6 s. Fixes: balance gate is unshielded-only, dust
address comes from the first state emission (key-derived, no sync needed),
`waitForDust` deadline 10 min → 24 h and runs unconditionally (covers restarts
where UTXOs are already registered). Result: funding passed in 6 s and dust
registration tx `00c44c15a2973ba032fa9586a19ad91aa2b17edadf2004b8eb64acb68f37a55ebc`
is confirmed on preprod — verifiable via the indexer.

**Still waiting on:** `dust.balance()` goes positive only once the dust
sub-wallet's sync reaches the registration tx — the same multi-hour
full-history grind. `deploy-all6` runs unassisted (`~/slopstream-deploy/
deploy-all6.log`, launcher `run-deploy.sh`); when dust shows it deploys all
three contracts and writes `contracts/preprod/deployment.json` in one shot —
pull + commit when it lands. Note sync state is in-memory
(`txHistoryStorage.storage = {}`), so any process restart re-grinds from
zero — leave the run alone.

**Backend revival (same day):** the Coolify stack on nuncio-vultr
(`slopstream-verifier|generator|api|orchestrator`) had been `exited` since
~Aug 31 — no containers, no FQDNs — which is why the Vercel site 404'd its
same-origin snapshot fetch. Restarted all four via the Coolify API; all
`running:healthy`. Two fixes the provisioning had never finished: (1) the
orchestrator got `fqdn=https://slopstream.144.202.117.160.sslip.io` via
artisan (the public API rejects `fqdn`), plus a manual
`docker network connect coolify` — apps deployed to the project network
aren't reachable by traefik otherwise; (2) the generator crash-looped on
`ASSET_BASE_URL` validation — set to
`https://slopstream-assets.144.202.117.160.sslip.io` (env var +
`fqdn` + coolify network attach; https cert may lag behind LE renewals —
http route already serves). Verified: snapshot 200 with valid cert,
`wss://…/ws` 101 upgrade, sequence advancing with real aired segments.
Frontend env is baked in `apps/web/vercel.json` `build.env` (e796e11) —
rebuilds pick up the gateway with no dashboard changes. NOTE: fqdn/env
edits were made directly in Coolify (artisan + API envs), not through
`provision-coolify.sh` — a future provisioner run may overwrite them.

**Research findings worth planning around:** mainnet contract deployment went
permissionless 2026-10-02 (no review gate — roadmap claim upgraded); ledger
v8→v9 fork in flight (v8-compiled contracts keep working post-fork);
midnight-js 5.0.0-rc.5 is the required pre-fork line (`MidnightConfig`
replaces `setNetworkId`, ESM-only); Compact 0.35 (lang 0.27) is ledger-9-only
— do NOT run bare `compact update`; `kernel.caller()` there could replace the
publicKey-hash verifier gate.

**Remaining for judges:** preprod deploy completion + real addresses in
`deployment.json`, rendered deck (`deck/slides.md` outline exists), 3-min
video, optional `fast-check` property test.

## Cross-lane integration status

| Integration point                | Status                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
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
