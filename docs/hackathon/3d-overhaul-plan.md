# 3D Visual Overhaul — Archived Prototype Plan

> **Superseded by the Continuum media world.** The current `/screen` backdrop
> is HTML media + CSS: a central portal, persistent archive cards, colourful
> spheres, typography and event ripples. Keep this document as the history of
> the R3F experiment and as a reference for future optional WebGL/WebGPU
> material effects; do not treat its full-3D decision as current product scope.

## Context

The first visual overhaul (Canvas 2D + Framer Motion) proved the event
language: audio-reactive backgrounds, soft-body blob chips, liquid
thresholds, flowing clearing streams, synthesized sound design. It works. But
to win a stacked field, the big screen needs to _be_ slop — a real 3D fluid
world with physics, not a 2D page with particles on top.

The decision (confirmed with the user):

- **Big screen**: full 3D — R3F + metaball shader + Rapier physics.
- **Listener + brand**: 2D with 3D accents (already most of the way there
  from the first overhaul).
- **Fluid technique**: dual path — GLSL ray-marching primary, mesh fallback,
  quality switch at startup.
- **Generation pipeline**: wired after the 3D world is stable. API keys
  provided by the user when ready.

See [design-language.md](../product/design-language.md) for the full vision.

## Status

| Phase | Status | Notes |
| ----- | ------ | ----- |
| 1 — R3F scene shell + metaball fluid shader | Done | `Scene`, `FluidBackground`, `shaders/metaball.glsl.ts` |
| 2 — Audio signal → shader uniforms | Done | `useAudioSignal` feeds `uAmplitude`/`uBeat`/`uBass`/`uTreble` |
| 3 — Brand blobs with Rapier physics | Done | Kinematic bodies + manual critically-damped spring; OUTBID velocity kick; `BallCollider` |
| 4 — The ad surface (tier evolution) | Done | `AdSurface` — orb (audio) / image plane / video plane; generating orb with progress rings; idle orb. Tier carried from generation → playback via `playingTier` in `StreamState` |
| 5 — Event-driven physics + 3D threshold | Done | `ThresholdBasin` (glass cylinder fills with brand fluid, wave shader, glow on clear); `ClearingStreams` (instanced particle burst, 80/20 split to listener + platform pools); OUTBID color flood + shockwave wired (Phase 3) |
| 6 — Floating HUD overlay + proof receipt | Done | `ProofReceipt3D` — glass card condenses from vapor on bid clear; stamp seal, count-up amounts, 80/20 split; auto-dismiss after 3.5s. `NowPlaying` stripped to text-only overlay (visuals now 3D) |
| 7 — Quality switch + fallback | Done | `FluidBackgroundMesh` — icosphere blob fallback with additive blending; capability detection at mount (WebGL2 + `MAX_TEXTURE_IMAGE_UNITS >= 16`); error boundary → Canvas 2D `AmbientCanvas` |
| 8 — Refine listener + brand | Done | Listener: real audio playback via `useAudioSignal(audioUrl)`, challenge card 3D parallax tilt. Brand: `WorldPreview` mini-canvas — a portal into the 3D big screen showing the brand's blob position in the leaderboard fluid |
| 9 — Generation pipeline | Done | `ElevenLabsGenerationProvider` — TTS (`eleven_v3`), image gen (`gemini-3-pro-image`), video gen (`veo-3.1-fast-generate-001`). Static asset serving on the generator server (`/assets/`). `GENERATOR_MODE=elevenlabs` wired. Web client plays real audio from `assetUrl` |

### Phase 3 implementation notes

- Brand blobs are **kinematic** (`type="kinematicPosition"`) driven by
  `setNextKinematicTranslation`, not dynamic bodies with per-frame impulses.
  A manual critically-damped spring (`a = -k·x - c·v`, `c = 2√k`, `k=60`)
  moves each blob toward its rank-determined target. This avoids the
  integrator overshoot/jitter that per-frame `applyImpulse` caused.
- The OUTBID impulse is a one-shot velocity kick applied inside the blob
  that matches `outbidDisplacedBrandId`; the spring then recovers it toward
  its new (demoted) target. Each blob self-selects, so the impulse fires
  exactly once on the right blob regardless of render timing.
- The fluid tint follows the **bid leader** (`leaderboard[0]`), not the
  playing segment. `FluidBackground` lerps `uColorA`/`uColorB` toward the
  new leader's palette via exponential approach (τ ≈ 0.15s → ~99% in ~0.7s)
  — the OUTBID color flood.
- `dpr` is capped at `[1, 1]` and `quality` is a prop — the two demo-safety
  levers for the fragment-heavy metaball shader.
- An error boundary around the R3F tree falls back to `AmbientCanvas`
  (Canvas 2D) if WebGL init or shader compile fails.

### Phase 4–7 implementation notes

- **AdSurface** (`AdSurface.tsx`): a tier-evolving 3D object at center stage.
  - `audio` tier → `AudioOrb`: an icosphere with a custom shader (simplex
    noise vertex displacement + fresnel rim + brand-color glow + audio
    flash). Pulses scale with `smoothAmplitude` + `beat`.
  - `audio_image` tier → `ImagePlane`: a `TextureLoader`-loaded image on a
    plane, with the `AudioOrb` rendered behind it for ambient ripples.
    Falls back to the orb if the texture fails (demo placeholder URLs).
  - `video` tier → `VideoPlane`: a `VideoTexture` from a `<video>` element,
    same behind-orb pattern. Falls back gracefully on decode error.
  - `generating` → `GeneratingOrb`: faster pulse + expanding progress rings
    (one per completed `GenerationStage`).
  - `idle` → `IdleOrb`: a dim, slowly breathing orb so the scene is never
    empty.
  - The tier is carried from generation → playback via `playingTier` on
    `StreamState` (the reducer now preserves `assetUrl` and `durationSeconds`
    from `segment.ready` through `segment.playing`).

- **ThresholdBasin** (`ThresholdBasin.tsx`): a glass cylinder at bottom
  center that fills with brand-colored fluid. The fill level is
  `verifiedCount / threshold`, smoothed via exponential approach
  (τ ≈ 0.3s). The fluid uses a custom shader: surface waves on the top
  (vertex displacement), color blend from secondary → primary as it fills,
  glow + white flash when cleared. The glass is a `MeshPhysicalMaterial`
  with `transmission` for realism.

- **ClearingStreams** (`ClearingStreams.tsx`): an `InstancedMesh` of 120
  small spheres that burst from the basin on `bid.cleared`. 80% are
  brand-colored and arc toward the listener reward pool (left); 20% are
  neutral gold and arc toward the platform pool (right). Each particle has
  position, velocity, and life; gravity + drag physics; fades over ~1.6s.
  Triggered by `burst.burstId` changing.

- **ProofReceipt3D** (`ProofReceipt3D.tsx`): an HTML overlay with
  `backdrop-filter: blur(20px)` that condenses from the center on bid
  clear. Spring-in with blur → sharp, a rotating stamp seal, count-up
  amounts (ease-out cubic over 800ms), 80/20 split rows, auto-dismiss
  after 3.5s. This is the screenshot moment.

- **FluidBackgroundMesh** (`FluidBackgroundMesh.tsx`): the mesh fallback
  for weak GPUs. Six drifting icospheres with additive blending and
  per-frame color lerp — approximates the fluid look at a fraction of the
  GPU cost. Same audio reactivity and brand tinting as the ray-marched
  path. Selected at mount via capability detection (WebGL2 +
  `MAX_TEXTURE_IMAGE_UNITS >= 16`).

- **NowPlaying** simplified: the 2D canvas background, receding segment
  ghosts, and generation orb were removed — the visuals are now 3D
  (`AdSurface`). `NowPlaying` keeps only the text labels (brand name,
  generation stages, challenge banner) as a `pointer-events: none` HTML
  overlay. The 2D `LiquidThreshold` and `ClearBurstFlow` were removed from
  the page — replaced by `ThresholdBasin` + `ClearingStreams` in the 3D
  scene. A small threshold count label (`verifiedCount / threshold`)
  remains as HTML for legibility.

### Phase 8–9 implementation notes

- **Listener real audio** (`useAudioSignal`): the hook now accepts an
  optional `audioUrl` parameter. When provided (live mode with a real
  `.mp3` asset URL), it creates a hidden `<audio>` element, connects it to
  a Web Audio `AnalyserNode`, and drives the signal from real frequency
  data (bass/mid/treble bins). When absent (demo mode with placeholder
  URLs), it falls back to the synthesized signal. Both the big screen and
  the listener screen pass `audioUrl` when the segment's `assetUrl` ends
  in `.mp3`/`.wav`/`.ogg`.

- **Challenge card parallax** (`ChallengeCard.tsx`): the card now tilts
  up to ±6° based on pointer position, using `perspective(800px)` +
  `rotateX`/`rotateY`. This gives the card a subtle 3D depth that matches
  the big screen's 3D world. The tilt resets to 0 on pointer leave.

- **Brand world preview** (`brand/page.tsx` → `WorldPreview`): a mini
  Canvas 2D component that mirrors the 3D big screen's brand blob field.
  The #1 brand is largest and centered; others recede in an arc. Each
  blob wobbles, glows with brand colors, and the viewer's brand gets a
  white highlight ring. This is the "portal into the big screen" — the
  brand console feels connected to the 3D world.

- **ElevenLabs generation provider** (`elevenlabsProvider.ts`): a full
  `GenerationProvider` implementation that uses ElevenLabs APIs:
  - **Script**: template-based ad script from the brand brief (hook →
    body → CTA), incorporating Continuum continuity from
    `previousSummaries`. No separate LLM API key needed.
  - **Voice**: `textToSpeech.convert` with `eleven_v3` model for
    expressive delivery. Output: MP3 (44100 Hz, 128 kbps).
  - **Image** (audio_image tier): `flows.image.create` with
    `gemini-3-pro-image` model. Polls until complete, downloads the PNG.
  - **Video** (video/premium tiers): `flows.video.create` with
    `veo-3.1-fast-generate-001` model. Picks the closest supported
    duration (4/6/8s). Polls until complete, downloads the MP4.
  - Assets are saved to `apps/generator/assets/` and served by the
    generator's new `/assets/` static route (CORS-enabled).

- **Static asset serving** (`server.ts`): the generator HTTP server now
  serves generated assets at `GET /assets/:key` with correct content
  types (MP3, MP4, PNG), CORS headers (`access-control-allow-origin: *`),
  and path traversal protection. This lets the web client load textures
  and play audio cross-origin.

- **Generator mode wiring**: `GENERATOR_MODE=elevenlabs` is now a valid
  mode alongside `stub` and `daytona`. The provider is lazily imported
  to avoid loading the ElevenLabs SDK in stub/daytona mode.

## Dependencies to install

```bash
pnpm --filter @slopstream/web add three @react-three/fiber @react-three/rapier @react-three/postprocessing
pnpm --filter @slopstream/web add -D @types/three
```

All are client-only (Next.js `"use client"`). No SSR concerns — the 3D scene
mounts in a `dynamic(() => import(...), { ssr: false })` wrapper.

## Build phases

### Phase 1 — R3F scene shell + metaball fluid shader

**Goal:** A full-viewport Three.js canvas rendering a ray-marched metaball
fluid. One fragment shader, one draw call. The fluid is always alive —
drifting, morphing. Tinted to a placeholder color.

**Files:**

- `apps/web/app/screen/_components/Scene.tsx` — the R3F `<Canvas>` wrapper,
  camera, lights, post-processing.
- `apps/web/app/screen/_components/FluidBackground.tsx` — a full-screen
  plane with a `ShaderMaterial` running the ray-marching metaball fragment
  shader.
- `apps/web/app/screen/_components/shaders/metaball.glsl.ts` — the GLSL
  source as exported strings (vertex + fragment).

**Shader approach (from interactive-droplets):**

- Fragment shader ray-marches SDF metaballs.
- Uniforms: `uTime`, `uAmplitude` (audio), `uBeat`, `uBass`, `uTreble`,
  `uColorA`, `uColorB` (brand palette), `uShockwave` (OUTBID), `uQuality`.
- Metaball positions drift with `uTime` + audio displacement.
- Surface ripples from `uTreble`, mass swells from `uBass`, shockwaves from
  `uShockwave`.
- `uQuality` controls march step count and metaball count for the fallback.

**Done when:** The big screen shows a living fluid background instead of the
Canvas 2D ambient particles. The fluid breathes with the synthesized audio
signal. No HTML elements yet — just the fluid.

### Phase 2 — Audio signal → shader uniforms

**Goal:** The fluid breathes with the audio. Bass swells the mass, treble
creates ripples, beats send shockwaves.

**Files:**

- Wire `useAudioSignal`'s `signalRef` into `FluidBackground` as uniforms.
- The existing `useAudioSignal` hook already produces `smoothAmplitude`,
  `beat`, `bass`, `mid`, `treble`. Map these to shader uniforms each frame.

**Done when:** Playing the demo fixture makes the fluid visibly pulse with
the audio. Beats create shockwaves. The room feels the stream.

### Phase 3 — Brand blobs with Rapier physics

**Goal:** Each brand is a 3D physics body floating in the fluid. The leader
is at center, largest, glowing. Others orbit behind, smaller, receding.

**Files:**

- `apps/web/app/screen/_components/BrandBlob.tsx` — a Rapier rigid body with
  an organic 3D mesh (icosphere with vertex displacement, or a
  `MeshDistortMaterial` from drei). Tinted to brand colors.
- `apps/web/app/screen/_components/BrandBlobField.tsx` — maps the leaderboard
  to blob positions. Rank 0 at center, others arranged behind with depth.
  Spring forces pull blobs toward their target positions. Rapier handles
  collisions.

**Physics:**

- Each blob is a `RigidBody` with `float` behavior — spring toward target
  position, damping to settle.
- On `bid.outbid`: apply an impulse from the new leader toward the displaced
  blob — a physical push out of center.
- On `leaderboard.updated`: update target positions; Rapier springs handle
  the re-sort animation.

**Done when:** The leaderboard is the blobs themselves. Re-sorting is a
physics animation. OUTBID is a physical collision.

### Phase 4 — The ad surface (tier evolution)

**Goal:** The ad is a 3D surface at center. The tier determines what surface:
orb (audio) → textured plane (image) → video plane (video).

**Files:**

- `apps/web/app/screen/_components/AdSurface.tsx` — renders the appropriate
  mesh based on `segment.tier`:
  - `audio`: a glowing icosphere with `MeshDistortMaterial`, emissive brand
    color, driven by audio amplitude.
  - `audio_image`: a plane with a `TextureLoader`-loaded image as `map`.
  - `video`: a plane with a `<VideoTexture>` from a `<video>` element.
  - `premium`: multiple planes.
- Previous segments recede behind the current ad as ghosted planes with
  depth-of-field blur (post-processing `DepthOfField`).

**Done when:** The demo fixture cycles through tiers and the ad surface
evolves. The audio orb pulses with the voiceover. The screen feels like a
stage, not a card.

### Phase 5 — Event-driven physics + 3D threshold

**Goal:** The signature events are 3D physics events, not CSS animations.

**Files:**

- `apps/web/app/screen/_components/ThresholdBasin.tsx` — a glass basin mesh
  that fills with brand-colored fluid. Fluid level driven by
  `attention.verifiedCount / attention.threshold`. Wave physics on the
  surface. Overflows on clear.
- `apps/web/app/screen/_components/ClearingStreams.tsx` — particle streams
  from the basin overflow toward two pool basins (80% listener, 20% platform).
  GPU points or instanced meshes.
- OUTBID shockwave: set `uShockwave` uniform on the fluid shader + apply
  impulse to brand blobs.
- Color flood: lerp `uColorA`/`uColorB` from old leader to new leader over
  ~600ms.

**Done when:** The full demo sequence plays through all signature moments in
3D: OUTBID collision + color flood + shockwave, threshold fill + overflow,
clearing streams, proof receipt condensation.

### Phase 6 — Floating HUD overlay + proof receipt

**Goal:** HTML elements float over the 3D canvas. The proof receipt
condenses from the vapor.

**Files:**

- The floating HUD (stats, live indicator, next-slot price) is an HTML
  overlay with `pointer-events: none` and glassmorphic styling. Already
  built from the first overhaul — reposition over the 3D canvas.
- `apps/web/app/screen/_components/ProofReceipt3D.tsx` — a glass card that
  condenses from the center of the 3D chaos. Could be a drei `<Html>`
  embedded in the 3D scene, or an HTML overlay with a backdrop blur that
  clears a circle in the fluid. The fluid continues to swirl around it but
  the card is perfectly still.

**Done when:** The demo screenshot moment — a glass proof receipt in the
center of a swirling 3D fluid world — is real.

### Phase 7 — Quality switch + fallback

**Goal:** Detect GPU/WebGL2 capabilities and switch between ray-marching and
mesh fallback.

**Files:**

- `apps/web/app/screen/_components/FluidBackgroundMesh.tsx` — the fallback:
  metaball meshes (icospheres) with a blur/composite post-processing pass.
  Same uniforms, same audio reactivity, lower visual fidelity.
- Capability detection at scene mount: check `WebGL2RenderingContext`,
  `MAX_TEXTURE_IMAGE_UNITS`, a quick benchmark of the shader compile time.
  If below threshold, use the mesh path.

**Done when:** The scene runs on both a high-end GPU (ray-marching) and a
weak GPU (mesh fallback) without dropping below 30fps.

### Phase 8 — Refine listener + brand (2D with 3D accents)

**Goal:** The listener and brand surfaces share the world's _feeling_.

**Listener:**

- Full-bleed audio-reactive canvas (already built).
- Glassmorphic challenge card with depth (already built).
- Proof receipt as the calm center (already built).
- Refine: add a subtle parallax/depth effect on the challenge card, tighten
  the audio reactivity.

**Brand:**

- Ambient brand glow canvas (already built).
- Tactile tier chips with hover scale (already built).
- Living leaderboard with layout animations (already built).
- Refine: add a "world preview" mini-canvas showing the brand's blob
  position in the 3D world — a small portal into the big screen.

**Done when:** All three surfaces feel like they belong to the same product.

### Phase 9 — Generation pipeline (post-3D, when API keys are ready)

**Goal:** Real TTS, image gen, video gen feed the 3D scene.

**Pipeline:**

1. TTS (ElevenLabs or similar) → audio file → `AnalyserNode` → drives fluid + orb.
2. Image gen (DALL-E / SDXL) → texture on center plane.
3. Video gen (Runway / Kling / Veo) → video texture on plane.
4. The 3D scene doesn't change — it just gets richer content.

**Files:**

- `apps/generator/src/providers/` — provider adapters behind the existing
  `generate()` HTTP boundary.
- The `GenerationResult.assetUrl` already flows through to the UI; the 3D
  scene loads it as a texture.

**Done when:** A real generated ad plays in the 3D world — a video-textured
plane at center, the audio driving the surrounding fluid, the brand's colors
flooding the metaball field.

## File structure (new 3D components)

```text
apps/web/app/screen/
├── page.tsx                    # Orchestrates: Scene + HUD overlay
├── _components/
│   ├── Scene.tsx               # R3F Canvas wrapper (ssr: false)
│   ├── FluidBackground.tsx     # Ray-marching metaball shader (primary)
│   ├── FluidBackgroundMesh.tsx # Mesh fallback (low quality)
│   ├── BrandBlob.tsx           # Rapier rigid body per brand
│   ├── BrandBlobField.tsx      # Maps leaderboard → blob positions
│   ├── AdSurface.tsx           # Tier-evolving ad mesh (orb/plane/video)
│   ├── ThresholdBasin.tsx      # 3D fluid container
│   ├── ClearingStreams.tsx     # Particle streams on clear
│   ├── ProofReceipt3D.tsx      # Glass card condensing from vapor
│   ├── shaders/
│   │   └── metaball.glsl.ts    # GLSL source (vertex + fragment)
│   └── ... (existing 2D components kept as fallback)
```

## What we keep from the first overhaul

- `useAudioSignal` — the shared audio signal hook. Feeds both shader uniforms
  and Rapier forces.
- `useSoundDesign` — Web Audio synthesized sounds. Unchanged.
- The 2D listener and brand surfaces — refined, not rebuilt.
- The demo fixture and `useDemoPlayer` — unchanged. The 3D scene reads the
  same stream state.
- The Canvas 2D components (`AmbientCanvas`, `SoftBlob`, `LiquidThreshold`,
  `ClearBurstFlow`) — kept as the ultimate fallback if WebGL is unavailable.

## Risk register

| Risk                                | Mitigation                                            |
| ----------------------------------- | ----------------------------------------------------- |
| Shader compile fails on demo laptop | Mesh fallback (Phase 7) + Canvas 2D ultimate fallback |
| Frame drops during demo             | Quality slider in shader; rehearse from fixture       |
| Rapier WASM load delay              | Show 2D ambient canvas until physics ready            |
| Video texture stutters              | Preload video; fall back to image if decode fails     |
| Next.js SSR issues with 3D          | `dynamic(() => import(...), { ssr: false })`          |

## Demo rehearsal checklist

- [ ] Run the full demo fixture on the presentation laptop
- [ ] Confirm 60fps (or 30fps minimum) throughout
- [ ] Test the quality switch — does fallback look acceptable?
- [ ] Screenshot the proof receipt moment — is it the winning shot?
- [ ] Test with real audio (not just synthesized) — does the fluid react?
- [ ] Test the OUTBID collision — is it visceral?
