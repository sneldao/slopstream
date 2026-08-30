# Archived: 3D Fluid-World Prototype

This document records an earlier big-screen direction: a full-viewport R3F
scene with ray-marched metaballs, Rapier brand blobs, a tier-evolving ad plane,
and 3D threshold/clearing effects.

## Decision record

The prototype proved that colour, sound reaction and market events should feel
physical. It did not make media the star: generated assets read as objects
inside a permanent 3D vignette, and the scene imposed the same composition on
every segment.

The current direction is the HTML/CSS **Continuum media world**, documented in
[design-language.md](../product/design-language.md). It uses a central media
portal, persistent archive cards, deterministic scene recipes, homepage-style
spheres and optional event ripples. It is more content-flexible, more reliable
on presentation hardware, and more coherent with the rest of the product.

## What remains useful

- Audio-reactive scale, light and ripple responses.
- Brand palette changes as a visible market event.
- A calm proof-receipt moment after clearing.
- Progressive enhancement experiments in WebGL/WebGPU, provided the screen
  remains fully functional without them.

## Do not treat as current scope

- A full-screen metaball shader as the default backdrop.
- Rapier physics as the primary representation of the leaderboard.
- GPU capability detection or a separate Canvas fallback for normal screen
  rendering.

The associated prototype components remain in the repository for reference and
may be selectively mined for future material effects. They are not imported by
the current home (`/`) scene.
