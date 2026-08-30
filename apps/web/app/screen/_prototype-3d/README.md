# Archived: 3D fluid-world prototype

Nothing in here is imported by the running app. These files are the WebGL
big-screen prototype that preceded the current DOM/CSS Continuum, kept on
purpose as reference material.

The decision to shelve them is recorded in
[docs/hackathon/3d-overhaul-plan.md](../../../../../docs/hackathon/3d-overhaul-plan.md):
the prototype proved that colour, sound reaction and market events should feel
physical, but it made the generated media a prop inside a permanent vignette
and imposed the same composition on every segment. The Continuum replaced it
because it is more content-flexible and more reliable on presentation
hardware.

They previously sat in `../_components/` alongside the eight components the
`/screen` route actually renders, which made it impossible to tell live code
from shelved code at a glance. That is the only reason they moved. The `_`
prefix keeps the directory out of Next.js routing, and `@/`-aliased imports
mean nothing needed rewriting.

## Contents

- `shaders/metaball.glsl.ts` — ray-marched SDF metaball fluid
- `FluidBackground.tsx` / `FluidBackgroundMesh.tsx` — shader + mesh fallback
- `BrandBlob.tsx` / `BrandBlobField.tsx` — Rapier brand blobs on outbid
- `AdSurface.tsx` — tier-evolving orb / plane / video surface
- `ThresholdBasin.tsx` — 3D fluid basin for the attention threshold
- `ClearingStreams.tsx` — particle 80/20 split toward reward pools
- `AmbientCanvas.tsx` — Canvas 2D drifting brand blobs
- `LiquidThreshold.tsx` — Canvas 2D liquid threshold fill
- `ClearBurst.tsx` / `ClearBurstFlow.tsx` — clearing burst variants
- `Leaderboard.tsx` / `AttentionThreshold.tsx` — pre-Continuum DOM panels

## Constraints if any of this is revived

Per the archived decision record, these are explicitly out of current scope: a
full-screen metaball shader as the default backdrop, Rapier physics as the
primary leaderboard representation, and GPU capability detection with a
separate Canvas fallback for normal rendering. Anything mined from here should
be progressive enhancement — `/screen` has to stay fully functional without it.

Two practical notes. `three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing` and `@react-three/rapier` are `devDependencies`,
because these files are type-checked but never bundled; reviving any of them
into the live tree means promoting the ones you use back to `dependencies`.
And the audio contract has not moved — everything here reads the same
`AudioSignal` from `@/lib/useAudioSignal` that the Continuum uses, so the
signal side needs no work.
