# Demo Recording Plan — 90 Seconds

Recorded video, live stack, mixed tier (audio → video), stub verifier.

## Strategy

Record one continuous take with the live stack. The audio segment generates
fast enough (~3-5s TTS). The video segment takes 1-3 minutes to generate —
record through it and cut the wait in post. The generation progress beats
(script → voice → image → video) make the cut look natural.

One simulated listener tab is enough: with `THRESHOLD_FRACTION=0.6` and 1
active listener, the threshold is `ceil(0.6 × 1) = 1` — one correct answer
clears the bid.

## Pre-recording setup (15 min before)

### 1. Configure timings for fast pacing

Create `apps/api/.env` (gitignored):

```ini
PORT=4000
PUBLISH_LIFECYCLE_EVENTS=0
AUCTION_DURATION_SEC=10
THRESHOLD_FRACTION=0.6
WINDOW_GRACE_SEC=2
SEED_DEMO=1
DEMO_ACME_BRAND_TOKEN=slopstream-demo-acme-token
ORCHESTRATOR_API_TOKEN=slopstream-demo-orchestrator-token
```

Create `apps/orchestrator/.env` (append to existing):

```ini
SEGMENT_PLAY_SEC=12
GEN_STAGE_DELAY_MS=500
AUCTION_POLL_MS=1000
EVENTS_POLL_MS=500
```

### 2. Verify env files

```text
apps/generator/.env:
  GENERATOR_MODE=elevenlabs
  ELEVENLABS_API_KEY=sk_...        (your key)
  ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
  ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
  ELEVENLABS_MAX_TIER=video        (already raised)
  ASSET_BASE_URL=http://localhost:4300

apps/orchestrator/.env:
  PARALLEL_API_KEY=uCZn...         (already set)
  + the timing vars above

apps/web/.env.local:
  NEXT_PUBLIC_STREAM_MODE=live
  NEXT_PUBLIC_API_BASE_URL=http://localhost:4200
  NEXT_PUBLIC_WS_URL=ws://localhost:4200
  NEXT_PUBLIC_DEMO_BRAND_TOKEN=slopstream-demo-acme-token

apps/verifier/.env:
  VERIFIER_MODE=stub
```

### 3. Start services in order

Open 5 terminal tabs:

```bash
# Tab 1 — Verifier
pnpm dev:verifier

# Tab 2 — Generator
pnpm dev:generator

# Tab 3 — API
pnpm dev:api

# Tab 4 — Orchestrator
pnpm dev:orchestrator

# Tab 5 — Web
pnpm dev:web
```

Wait for each to print its listening message before starting the next.

### 4. Pre-warm (dry run)

Before recording, run through the full loop once to verify everything works
and pre-cache the ElevenLabs voice model:

1. Open `http://localhost:3000/brand` — verify ACME AI balance shows $500
2. Open `http://localhost:3000/listen` in a second tab — verify listener joins
3. Place a $15 bid (audio tier) from the brand console
4. Wait for the auction to close (~10s) and generation to complete (~5s)
5. Answer the challenge on the listener tab
6. Verify the threshold clears and the bid splits 80/20
7. If everything works, restart the API to reset the ledger:

```bash
# Kill the API process (Ctrl+C in tab 3) and restart it
pnpm dev:api
```

This gives you a clean ledger with fresh $500 balances for the recording.

### 5. Browser setup for recording

- **Tab 1 (big screen)**: `http://localhost:3000/screen` — fullscreen, 1920×1080
- **Tab 2 (listener)**: `http://localhost:3000/listen` — phone-sized window (375×812)
- **Tab 3 (brand console)**: `http://localhost:3000/brand` — phone-sized window (375×812)
- Screen recording: OBS / QuickTime / Loom — capture the big screen tab
- For the listener + brand, record those tabs separately and edit in post,
  or use a picture-in-picture overlay

## Recording script — 90 seconds

### Phase 1: Hook + market (0-12s)

| Time | Action | Narration                                                                                                                                                                                                                                        |
|------|--------|-----------                                                                                                                                                                                                                                       |
| 0-5s | Show the big screen — 3D fluid world, empty market, "Slopstream" title | "Brands spend billions on ads people scroll past. Slopstream is a live attention market — brands bid for verified attention, and listeners earn up to 80% of the cleared spend." |
| 5-12s | Switch to brand console — show balance, bid input | "A brand bids for the next slot in a live auction. This is not an impression — it's a verifiable attention contract."                                                                                |

### Phase 2: Bid + auction (12-25s)

| Time | Action | Narration                                                                                                               |
|------|--------|-----------                                                                                                              |
| 12-15s | Place $15 bid (audio tier) from brand console | "ACME AI bids fifteen dollars for the next ad slot."                           |
| 15-22s | Switch to big screen — show leaderboard updating, auction countdown | "The market is live. The auction closes in ten seconds." |
| 22-25s | Auction closes — generation begins | "ACME wins the slot. Now the ad is generated in real time."                               |

### Phase 3: Real AI generation + playback (25-45s)

| Time | Action | Narration                                                                                                                                                                                                                                                     |
|------|--------|-----------                                                                                                                                                                                                                                                    |
| 25-30s | Big screen shows generation progress: Script ✓ → Voice ✓ | "ElevenLabs generates the voiceover — a real AI ad, not a pre-recorded clip."                                                                                                                             |
| 30-32s | Generation completes, segment.ready fires | "The ad is ready."                                                                                                                                                                                                       |
| 32-45s | Ad plays on the big screen — real TTS audio drives the fluid shader. Brand colors flood the metaball field. Show the listener tab reacting to the same audio. | "The ad plays. The audio drives the 3D fluid world in real time. Listeners hear it on their phones." |

### Phase 4: Challenge + verification (45-65s)

| Time | Action | Narration                                                                                                                                               |
|------|--------|-----------                                                                                                                                              |
| 45-50s | Challenge card appears on listener tab | "A challenge fires: 'What did ACME say it supports?' The listener must prove they engaged."                           |
| 50-55s | Answer the challenge on the listener tab | "One correct answer. The proof is verified — segment binding, timing window, replay protection."                    |
| 55-60s | Big screen — attention threshold fills (1/1), proof receipt condenses | "The attention threshold is met. The proof is recorded."                               |
| 60-65s | Big screen — bid clears, 80/20 split animation | "The bid clears. Fifteen dollars splits into twelve for the listener reward pool and three for the platform." |

### Phase 5: Next bid + video generation (65-90s)

| Time | Action | Narration                                                                                                                                                                                                                                                  |
|------|--------|-----------                                                                                                                                                                                                                                                 |
| 65-70s | Switch to brand console — place $25 bid (video tier) | "The market doesn't stop. The next bid comes in — this time for a full video ad."                                                                                                                          |
| 70-78s | Big screen — generation progress: Script ✓ → Voice ✓ → Image ✓ → Video ✓. **In post: cut the 1-3 min wait to ~5s.** The progress beats make the cut invisible. | "ElevenLabs generates the video — voice, image, and a cinematic clip, all from the brand brief." |
| 78-88s | Video plays on the big screen — video-textured plane in the 3D fluid world, audio driving the shader | "The video ad plays inside the fluid world. The audio still drives the scene."                                                                             |
| 88-90s | Closing shot — the loop continues | "Brands bid. People prove attention. Value flows back to the audience. The market starts again."                                                                                                                              |

## Post-production

1. **Cut the video generation wait**: The video tier takes 1-3 min to generate.
   During recording, the screen shows generation progress beats with the
   "GENERATING" overlay. In post, cut everything between "Voice ✓" and
   "Video ✓" down to 1-2 seconds. The progress checkmarks make it look like
   the video generated in seconds.

2. **Picture-in-picture**: Overlay the listener tab (phone frame) in the
   bottom-right corner during Phase 3-4. Overlay the brand console in the
   top-left during Phase 2 and Phase 5.

3. **Narration**: Record voiceover separately in a quiet room. Sync to the
   edited video. Keep it tight — the script above is ~90 words.

4. **Music**: Low ambient pad under the narration. Drop out during the ad
   playback so the real TTS audio is audible.

## Fallback plan

| Risk | Mitigation                                                                                                                                                                                     |
|------|------------                                                                                                                                                                                    |
| ElevenLabs TTS fails | Fall back to `GENERATOR_MODE=stub` — the stub generates instantly with placeholder assets. The 3D scene still works.                                                           |
| Video generation times out | Cut the video segment entirely. End the demo after the audio segment clears. 65s is still a complete loop.                                                               |
| Listener challenge doesn't fire | Ensure the listener tab is open BEFORE the segment starts playing. The challenge is generated from the transcript at `segment.ready` time.                          |
| Threshold doesn't clear | With 1 listener and `THRESHOLD_FRACTION=0.6`, threshold = 1. One correct answer clears. If it doesn't, check that the listener session was created before playback started. |
| Services crash | Restart the failed service. The orchestrator is resilient — it'll pick up where it left off on the next poll.                                                                        |
| Auction doesn't close | Verify `AUCTION_DURATION_SEC=10` in the API `.env`. The auction auto-closes on a timer.                                                                                       |

## Quick reference — what's real vs stubbed

| Component | Status | What to say                                                                                                                                                                                               |
|-----------|--------|-------------                                                                                                                                                                                              |
| ElevenLabs TTS | **Real** — `eleven_flash_v2_5` model | "Real AI-generated voiceover"                                                                                                                                          |
| ElevenLabs image gen | **Real** — `gemini-3-pro-image` | "AI-generated ad creative"                                                                                                                                            |
| ElevenLabs video gen | **Real** — `veo-3.1-fast-generate-001` | "AI-generated video ad"                                                                                                                                        |
| Parallel scraper | **Real** — discovers companies via Parallel Search API | "Cold-start discovery from HN, Product Hunt, YC" (if asked)                                                                                        |
| Proof verifier | **Stub** — typed JSON checks | "The verifier checks segment binding, timing, and replay protection. The Midnight contract is compiled and ready to deploy — same interface, zero-knowledge proofs on-chain."  |
| Stripe payments | **Mock** — in-memory ledger | "Stripe moves the dollars in production. The hackathon ledger simulates the balances and splits."                                                                              |
| Midnight contract | **Compiled, not deployed** | "ProofOfAttention.compact is compiled against the Midnight preprod testnet. Deploy is a single script — we keep it in stub mode for the demo to avoid external dependencies." |
