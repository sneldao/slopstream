# Design Language: A Living Canvas

Slopstream is not a dashboard. It is a living, colorful, fluid canvas — an art installation that happens to be a marketplace. The product is named after slop: gooey, liquid, flowing abundance. The UI should _be_ slop.

## Visual references

Four projects define the direction:

- **[Floaty](https://github.com/matsuoka-601/Floaty)** — soft-body and fluid simulation. The soul of Slopstream: things squish, flow, splash, and react with playful physics. OUTBID is a splash. A cleared bid bursts into reward droplets. The attention threshold is a liquid filling up, not a striped progress bar. Brand mascots are soft-body blobs competing for the slot.
- **[Infinite Canvas](https://github.com/edoardolunardi/infinite-canvas)** — a 3D media space you drift through. Infinite Slop becomes spatial: the current ad is center-stage, previous segments (the robot escaping the lab, getting hired, hitting Shark Tank) recede behind it in a navigable grid. The continuity story is a _place_, not a playlist.
- **[Spotify Visualiser](https://github.com/J0SUKE/spotify-visualiser)** — audio-reactive GLSL. The stream's heartbeat: the background pulses with the voiceover, colors shift per brand, generation stages ripple outward. The room feels the stream even when nobody's looking directly at it.
- **[Codrops Interactive Grid](https://github.com/samueljarry/codrops-tutorial-grid)** — tactile grid grammar. Hover-distortions on brand tiles, image grids that warp and respond, tactile feedback on every touchable thing.

## The aesthetic

- **Not dark, not white — saturated and shifting.** The background is a living gradient that takes on the current brand's color identity. When Acme's ad plays, the screen is in Acme's blues. When CoolStartup outbids them, the screen floods with CoolStartup's orange. The color transition _is_ the OUTBID moment — paint washes across the screen.
- **System fonts, not monospace.** Monospace reads as "developer tool." Slopstream reads as "playful marketplace." Use a clean sans-serif system stack with bold weights for emphasis.
- **High contrast text.** White or near-black depending on background luminance. The leaderboard entries are colored chips, not table rows.
- **One calm moment.** The proof receipt is the one place that stays still — a clean, slightly translucent card that floats above the chaos. It's the moment of certainty in the slop.

## The build stack — a 3D fluid world

The first pass faked the _feeling_ with Framer Motion + Canvas 2D. It was
good. But to win a stacked field, the big screen needs to _be_ slop — a real
3D fluid world, not a 2D page with particles on top.

### What the references teach us

- **[Floaty](https://github.com/matsuoka-601/Floaty)** — Rust + WASM Position
  Based Fluids. The soul: things squish, flow, splash with real physics.
  Research-grade; a multi-day integration risk on its own.
- **[interactive-droplets](https://github.com/koji014/interactive-droplets)** —
  Three.js + GLSL ray-marching metaballs. The pragmatic path to the Floaty
  feeling: a single full-screen fragment shader ray-marches signed-distance-
  field metaballs. One draw call. Looks like real fluid. Responds to input.
  This is the technique that gives us liquid brand blobs that merge and split
  without a physics engine.
- **[Abstract Singularity](https://github.com/cartuhok/Abstract_Singularity)** —
  React Three Fiber + Rapier physics. 3D shapes with real rigid-body physics
  that respond to clicks and pushes. This is the interaction model — brands as
  physical objects that get knocked around.

### The vision: Slopstream is a 3D fluid world, not a screen

The big screen is a Three.js world where the "slop" is a ray-marched metaball
fluid that fills the entire viewport, tinted to the current brand's colors.
It's always alive — drifting, morphing, breathing with the audio. The metaball
shader is driven by the audio signal: bass swells the fluid mass, treble
creates surface ripples, beats send shockwaves through the field.

**Brands are physical 3D blobs in the fluid.** Each brand is a Rapier physics
body — a soft, organic 3D shape floating in the slop. They compete for the
center "slot" position. The leader is largest, at center, glowing. Others
orbit behind, smaller, receding. When OUTBID fires, the new leader's blob
physically pushes the displaced blob out of center — a physics collision, not
a CSS animation. The fluid changes color as the new brand's palette floods
through the metaball field.

**The ad lives inside the world.** The ad is not a flat card overlaid on a
background — it's a 3D surface _within_ the fluid. The production tiers evolve
naturally inside the same scene:

| Tier          | What's at center                                     | Audio's role                                                                                                   |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Audio         | A glowing 3D orb.                                    | The TTS voiceover drives concentric ripple waves through the surrounding fluid. The world _is_ the visualizer. |
| Audio + image | A textured plane materializes (the generated image). | The audio orb sits behind it; ripples still emanate.                                                           |
| Video         | A video-textured plane at center.                    | The video's audio track drives the fluid around it. The video is _in_ the slop, not _on_ the screen.           |
| Premium       | Multiple planes — a mini-scene within the scene.     | Full audio reactivity across all surfaces.                                                                     |

**The leaderboard is the blobs themselves.** No separate chip list. The brand
blobs are arranged by bid amount in 3D space — leader at center, others
receding with depth and blur. Re-sorting is a physics animation: blobs
physically swap positions with spring forces. You _see_ the market in space.

**The attention threshold is a 3D fluid container.** A glass basin in the
scene that fills with the brand's colored fluid. As verified counts rise, the
fluid level rises. When it clears, it overflows — fluid pours out in a
particle stream toward the listener reward pool, which is another 3D basin.
The 80/20 split is a physical fluid split in 3D space.

**The proof receipt is the one still moment.** A glass card that _condenses_
out of the vapor in the center of the chaos. The fluid continues to swirl
around it but the card is perfectly still, perfectly sharp. Proof hash types
in. Reward counts up. "VERIFIED BY MIDNIGHT" seals it. This is the screenshot
that wins.

### Surface scope

| Surface       | Approach                                                        | Rationale                                                                      |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Big screen    | Full 3D: R3F + metaball shader + Rapier physics                 | The showpiece. This is what judges lean forward for.                           |
| Listener      | 2D with 3D accents: glassmorphism, depth, audio-reactive canvas | Shares the world's _feeling_ without the GPU cost on a phone. Faster to build. |
| Brand console | 2D with 3D accents: ambient glow, tactile chips, depth          | The control room overlooking the world. Conveys pressure without full 3D.      |

### Fluid technique — dual path with quality switch

| Path                   | Technique                                                           | When                              |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------- |
| Primary (high quality) | GLSL ray-marching SDF metaballs, one fragment shader, one draw call | WebGL2 available, GPU is adequate |
| Fallback (low quality) | Metaball meshes + blur/composite post-processing pass               | Weaker GPU or WebGL2 unavailable  |

The scene detects capabilities at startup and selects the path. Both paths
read the same audio signal and event stream — only the rendering differs.

### Dependencies

- **Three.js + React Three Fiber (`@react-three/fiber`)** — declarative 3D in
  React, fits Next.js. The scene graph is React components.
- **`@react-three/rapier`** — WASM rigid-body physics. Brand blobs collide,
  push, and spring with real physics. Fast enough for 60fps.
- **`@react-three/postprocessing`** — bloom, depth of field, chromatic
  aberration for the fluid glow and the receding-segment blur.
- **Framer Motion** — spring physics and layout animations for the 2D
  surfaces (listener, brand) and the floating HUD overlay on the big screen.
- **Web Audio API `AnalyserNode`** — drives shader uniforms and physics
  forces. The shared `useAudioSignal` hook already exists; it feeds both the
  shader and the Rapier bodies.

### Performance and demo safety

The design-language warning about frame drops is real. Mitigations:

- The metaball shader is **one fragment shader, one draw call** — not a
  particle system with thousands of objects.
- Rapier runs in **WASM** — used in production games.
- **Rehearse the demo from the fixture** — know the exact frame rate before
  walking on stage.
- **Keep the Canvas 2D fallback** — if the presentation laptop has a bad GPU,
  the scene degrades to the existing 2D version.
- **Quality slider in the shader** — drop metaball count or ray-march steps
  mid-demo if needed.

### Generation pipeline (post-3D)

The 3D scene is the constant. The pipeline feeds it content. The generator
already has the HTTP boundary (`POST /v1/generations`); we swap the stub
`generate()` for real provider calls. The 3D scene doesn't change — it just
gets richer content to display.

| Tier          | Pipeline output                           | Scene impact                                         |
| ------------- | ----------------------------------------- | ---------------------------------------------------- |
| Audio         | TTS audio file → `AnalyserNode`           | Drives the fluid + orb                               |
| Audio + image | TTS + image gen → texture on center plane | Plane materializes with the brand's generated visual |
| Video         | TTS + image + video gen → video texture   | Video-textured plane, audio drives surrounding fluid |
| Premium       | Multiple assets → multiple planes         | A mini-scene within the scene                        |

API keys for TTS, image gen, and video gen are wired after the 3D world is
stable. The world is stunning with placeholder content; real generation makes
it undeniable.

## Per-surface behavior

### A. The big screen — a 3D fluid world, not a scoreboard

The big screen is the centerpiece. It is a Three.js world — a lava lamp
crossed with a stock exchange, rendered in 3D with real physics.

**The fluid world.** The background is a ray-marched metaball shader — a
single full-screen fragment shader pass that renders signed-distance-field
metaballs as liquid slop. It fills the entire viewport, tinted to the current
brand's colors. It's always alive: drifting, morphing, breathing with the
audio signal. Bass swells the fluid mass, treble creates surface ripples,
beats send shockwaves through the field.

**Brands as physical 3D blobs.** Each brand is a Rapier physics body — a
soft, organic 3D shape floating in the slop. They compete for the center
"slot" position. The leader is largest, at center, glowing. Others orbit
behind, smaller, receding with depth-of-field blur. Re-sorting is a physics
animation: blobs physically swap positions with spring forces. You _see_ the
market in space.

**The ad lives inside the world.** The current ad is a 3D surface at center —
a glowing orb (audio), a textured plane (audio + image), or a video-textured
plane (video). The ad's audio drives the surrounding fluid. Previous segments
recede behind it in 3D space with perspective and blur — the Infinite Slop
continuity is visible as a trail of receding media in depth.

**The OUTBID moment.** This is the signature event. When a brand is overtaken:

1. The new leader's blob physically pushes the displaced blob out of center —
   a Rapier collision, not a CSS animation.
2. The fluid's color floods from the old leader's palette to the new leader's
   palette through the metaball field.
3. A shockwave ripples through the fluid from the collision point.
4. "OUTBID" text bursts in with spring overshoot, then settles.

**The attention threshold as a 3D fluid container.** A glass basin in the
scene that fills with the brand's colored fluid. As verified counts rise, the
fluid level rises with wave physics. When the threshold is met, the liquid
glows and overflows — fluid pours out in a particle stream toward the listener
reward pool (another 3D basin). The 80/20 split is a physical fluid split in
3D space. The "$25 CLEARED" moment fires as the overflow begins.

**The clearing animation.** When a bid clears, the full bid amount appears as
a glowing number at the basin. It splits into two particle streams — 80%
flows toward "LISTENER REWARD POOL" (in the brand's color), 20% flows toward
"SLOPSTREAM" (in a neutral/platform color). The pool counters tick up as
particles arrive.

**The generation sequence.** While an ad generates, the center orb pulses
with a fluid loading state. Each stage (script, voice, image, video) checks
off with a small splash in the fluid as `generation.progress` events arrive.
When `segment.ready` fires, the orb transforms into the ad surface for the
tier — orb → textured plane → video plane.

**The floating HUD.** Stats (listeners, attention proofs, listener rewards)
and the "SLOPSTREAM" live indicator are a floating HTML overlay on top of the
3D canvas — glassmorphic, blurred backdrop, positioned with CSS. Numbers count
up smoothly, never snap. When a new listener joins (QR scan), the listener
count pulses and a brief "NEW LISTENER" ripple appears in the fluid.

### B. The listener client — a portal into the world (2D with 3D accents)

The listener experience should feel like a game show on a phone — bright,
bouncy, and responsive. It shares the _feeling_ of the 3D world without the
GPU cost: glassmorphism, depth, audio-reactive canvas.

**Joining.** After QR scan, the listener sees a brief splash animation as they "enter the stream." The big screen's listener count ticks up simultaneously (if the listener looks up, they see themselves arrive).

**While listening.** A full-bleed audio-reactive canvas background — drifting brand-tinted blobs that breathe with the stream audio. The audio visualizer is a pulsing blob that deforms with amplitude and brightens on beats. The brand's color palette tints their screen, matching the big screen.

**Challenge appearance.** The challenge card pops in with spring overshoot, accompanied by a haptic vibration and a short sound. A countdown timer (driven by `validFrom` / `validUntil`) creates urgency — the timer ring depletes visibly. The challenge options are large, colorful tappable buttons, not radio inputs.

**Correct answer.** The card bursts into the proof receipt — the one calm moment. The receipt floats in as a translucent card above the visualizer. The proof hash types in character by character. The estimated reward amount counts up. A subtle "VERIFIED BY MIDNIGHT" stamp effect seals it. Then the receipt fades and the stream continues.

**The live attention meter.** While challenges are active, the listener sees the collective progress — "127 / 143 verified" — as a liquid fill matching the big screen's threshold visualization. They feel the collective event, not just their own answer.

### C. The brand bidding console — a control room overlooking the world (2D with 3D accents)

The brand console should convey that you're in a live auction against other
brands, not filling out a form. It's a control room overlooking the 3D world —
ambient brand glow, tactile chips, depth.

**Ambient brand glow.** A fixed canvas behind the console renders drifting
blobs in the brand's colors. The glow intensifies on OUTBID and when winning —
the console breathes with the brand's market position.

**Live bid pressure.** The current winning bid pulses when it changes. When the brand is outbid, the console flashes an OUTBID alert with sound + vibration, the ambient glow surges red, and the brand should feel the pressure of being overtaken in real time.

**Cost-per-verified-attention estimate.** Using the surfaced listener count: "~$0.026 / verified attention at 1,284 listeners and 60% threshold." This makes the bid feel real — not just a number, but a price for something measurable.

**Slot countdown.** A visible timer to when the current slot closes and generation begins. The auction isn't open-ended; there's a window, and it's closing.

**Tier selection as tactile chips.** The production tiers (audio / audio+image / video / premium) are colorful tappable chips, not a static table. Selecting a tier tints the console with that tier's accent color.

**Bid confirmation.** When a bid is placed, a particle effect flows from the brand's chip toward the leaderboard — the brand can see their bid "arriving" in the market.

### D. The proof receipt — the calm center

The signature artifact. The one moment of stillness in the slop. On the big
screen, the glass card _condenses_ out of the vapor in the center of the 3D
chaos — the fluid continues to swirl around it but the card is perfectly
still, perfectly sharp. On the listener client, it floats in as a translucent
card above the visualizer. Monospace for the proof hash only (everything else
is sans-serif).

**Animation sequence:**

1. Card fades in with a slight scale-up spring.
2. "ATTENTION VERIFIED" stamp effect — a circular seal that rotates and stamps in.
3. Proof hash types in character by character (`0x8F29...`).
4. Estimated reward amount counts up from $0.00 to ~$0.37.
5. "VERIFIED BY MIDNIGHT" appears as a subtle footer with a faint glow.
6. Card holds for 3 seconds, then fades out as the stream continues.

This is the moment to demonstrate **why Midnight exists**. The audience sees:

> I answered → proof → reward.

The receipt is worth 30 minutes of dedicated design polish — it's the thing judges will screenshot.

## Event-to-screen mapping

Every WebSocket event produces a visible reaction. This is the actual UX spec for Lane 3:

| Event                 | Big screen (3D world)                                                                                                            | Listener client (2D + 3D accents)                                           | Brand console (2D + 3D accents)                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bid.placed`          | New brand blob spawns into the fluid, springs toward its rank position                                                           | —                                                                           | Bid confirmation particle effect                         |
| `bid.outbid`          | New leader blob physically pushes displaced blob out of center, fluid color floods, shockwave ripples through the metaball field | —                                                                           | OUTBID alert, sound + vibration, ambient glow surges red |
| `leaderboard.updated` | Brand blobs re-sort with Rapier spring physics, next-slot price ticks                                                            | —                                                                           | Winning bid updates with pulse                           |
| `segment.generating`  | Center orb pulses with fluid loading state                                                                                       | "Next ad coming..." with subtle animation                                   | —                                                        |
| `generation.progress` | Stage checks off with a splash in the fluid                                                                                      | —                                                                           | —                                                        |
| `segment.ready`       | Orb transforms into the ad surface for the tier (orb → plane → video plane)                                                      | —                                                                           | —                                                        |
| `segment.playing`     | Ad surface at center, fluid tinted to brand palette, audio drives the metaball shader                                            | Full-bleed audio-reactive canvas activates, screen tints to brand color     | —                                                        |
| `challenge.fired`     | Challenge banner as floating HUD overlay                                                                                         | Challenge card pops in with spring + haptic + sound, countdown timer starts | —                                                        |
| `attention.verified`  | 3D fluid basin fills higher, surface waves, pulse effect                                                                         | Attention meter updates, personal verified indicator                        | —                                                        |
| `bid.cleared`         | Basin overflows, particle split into 80/20 streams toward 3D pool basins, "$25 CLEARED"                                          | —                                                                           | Bid cleared confirmation                                 |
| `bid.uncleared`       | "THRESHOLD NOT MET" — somber but clear, bid returned                                                                             | —                                                                           | Bid returned notification                                |
| `reward.pool.updated` | Listener rewards stat counts up in floating HUD                                                                                  | Estimated reward updates on receipt                                         | —                                                        |
| `stats.updated`       | All floating HUD stats count up smoothly                                                                                         | —                                                                           | —                                                        |

## Color system

**Per-brand palettes.** Each brand defines a primary and secondary color when creating a campaign. These colors drive:

- The big screen's 3D fluid shader tint while the brand's ad plays
- The brand's 3D blob color in the fluid world
- The listener client's tint during the brand's segment
- The brand console's ambient glow color
- The particle stream colors when the brand's bid clears

**Platform colors.** Slopstream's own identity uses a vibrant, saturated base — not a single brand color but a neutral-yet-living gradient (think: shifting aurora). The platform's 20% share in the clearing animation uses a neutral accent (white or pale gold) to distinguish it from any brand's color.

**Threshold/certainty colors.** The attention threshold liquid shifts from warm (filling, in progress) to bright (threshold met, cleared). The proof receipt uses a calm, high-contrast white-on-translucent regardless of brand color — certainty has no brand.

**Transition colors.** The OUTBID color wash is the most dramatic moment: the old leader's palette drains out as the new leader's palette floods in. This should take ~600ms — fast enough to feel instant, slow enough to feel like paint flowing, not a snap.
