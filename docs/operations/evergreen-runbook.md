# Evergreen Loop operations: one-time mint + generator-off runbook

> Phase 1 Eternal Loop (docs/product/evergreen-loop.md Stage 1).
> Generate once, loop forever, $0/day. This runbook covers the single
> ElevenLabs session that mints the catalog and the Coolify posture that
> keeps the stream alive with generator + scraper off.

## 0. What you end up with

- `EVERGREEN_CATALOG_DIR/`: one JSON file per entry (`evergreen_<slug>.json`).
- `EVERGREEN_MEDIA_DIR/`: content-addressed bytes (`audio/<sha>.mp3`,
  `image/<sha>.png`, `video/<sha>.mp4`).
- API boots fail-closed: every declared byte is SHA-256 verified before
  the first airing. A typo mints nothing; it never airs silence.
- Orchestrator runs `EVERGREEN_MODE=1`: each tick mints the next rotation
  via `POST /evergreen/air-next` and plays it as a live segment
  (playing -> challenges -> window-closed). No generation, no scraper.

## 1. One-time generation session (single ElevenLabs run)

1. **Configure the generator for direct mode** (local machine only):
   `GENERATOR_MODE=elevenlabs`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`,
   `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` (cheaper for the bulk mint),
   `ELEVENLABS_MAX_TIER=audio_image` (video sparingly — 1-2 entries max),
   `ASSET_BASE_URL=https://assets.example.com/slopstream`.
2. **Mint 12-15 candidates** across 3-4 fictional brands (Acme-style).
   Keep briefs to 15-20s of speech (~40-55 words). Favor `audio` and
   `audio_image`; video only for hero spots.
3. **Collect results**: save each `GenerationResult` (assetUrl + media +
   transcript + summary + durationSec) into `mint-queue.json` as
   `{ "results": [...] }`. Download URLs may be `https:` or local `file:`.
4. **Curate**: delete duds from the queue before minting. Keepers need a
   non-empty transcript (challenges are generated from it) and a summary.
5. **Mint the catalog** (dry-run first):
   `tsx src/scripts/mint-evergreen.ts --in ./mint-queue.json --catalog-dir
   ./evergreen/catalog --media-dir ./evergreen/media --brandId brand_acme
   --tier audio_image --dry-run`, then again without `--dry-run`.
   Repeat per brand (one `--brandId` per run).
6. **Verify**: `GET /evergreen/catalog` lists entries; fetch one entry's
   `/evergreen/media/<key>` and compare SHA-256 with the JSON.

## 2. Content policy (enforced at mint, not after)

- Every brief is prefixed `Unofficial AI-generated parody ad ...`
  (override with `--label`). No real-brand defamation, no adult / pharma /
  crypto-yield claims. A human screens every keeper — curation IS the filter.
- Transcript check: if the TTS script names a real company, either
  fictionalize it or drop the segment.

## 3. Generator-off Coolify posture (the steady state)

| Service      | Setting |
| ------------ | ------- |
| Generator    | `GENERATOR_MODE=stub`, no `ELEVENLABS_API_KEY` secret mounted |
| Orchestrator | `EVERGREEN_MODE=1`, `STREAM_ENABLED=true`, no `PARALLEL_API_KEY` |
| API          | `EVERGREEN_CATALOG_DIR=/data/evergreen/catalog`, `EVERGREEN_MEDIA_DIR=/data/evergreen/media`, `EVERGREEN_ASSET_BASE_URL=https://assets.example.com/slopstream`, `SEED_DEMO=0` |
| Volumes      | Catalog + media dirs mounted read-only into the API |

Rotation weights: new entries mint with `"weight": 2-3` plus
`"weightUntil": "<now + 7d>"` for boosted rotation, then decay to base.
Cadence: one fresh segment a week keeps the loop from going stale.

## 4. Rollback

- Bad catalog push -> API refuses boot (fail-closed), previous container
  keeps serving. Fix the JSON/bytes, redeploy.
- Empty catalog at runtime -> `POST /evergreen/air-next` returns 409,
  scheduler logs and retries next tick; encores cover dead air.
