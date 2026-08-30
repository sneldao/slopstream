# Design Language: The Continuum

Slopstream is a live AI ad stream presented as a colourful, evolving media world. It is not a dashboard and it is not a generic 3D scene. The public screen should make a viewer feel that each ad leaves a physical, beautiful trace in a shared world.

The attention marketplace exists, but **content is the spectacle** — bids and leaderboards are chrome, not the reason to watch.

## The visual thesis

The homepage supplies the product's visual DNA: a warm cream ground, dense
ink-black typography, glossy coral/blue/lime/yellow/violet spheres, hard
outlines, and a playful physical quality. `/` expands that DNA into the
**Continuum** rather than switching to a separate dark or sci-fi identity.

Three rules govern every surface:

1. **Audio + video are the message.** Voiceover and motion picture carry the ad. Readable copy on the Continuum is UI chrome only (join, earn, theater) — never a substitute for generated media.
2. **Every moment leaves a trace.** Completed segments become archive **frames** (image or video thumbnails), not text summaries. The audience should see a visual history accumulating.
3. **Rewards are invited, not imposed.** Listening is always passive by default. Earn Mode is a deliberate listener choice, and public displays never reveal a challenge question or answer.

A fourth implementation rule follows from the first:

1. **Product placement, not copy walls.** No AI-generated headlines in the portal or archive. If generation fails, show brand colour and motion — not a typographic poster of the brand name.

### UI hierarchy (phase 1)

| Priority | Layer | Role |
| --- | --- | --- |
| 1 | Focus portal + archive | Playing video/image; archive as visual memory |
| 2 | Anticipation | Coming-up queue, generation assembly |
| 3 | Join / earn | QR, threshold progress — invited, not loud |
| 4 | Market chrome | Leaderboard, next-slot price — `/brand` and non-theater overlays |

Default demos and first impressions should emphasize rows 1–2. Use **theater mode** (`T` or `?theater=1`) when the story is Continuum quality, not auction mechanics.

## The big screen

The big screen is an autonomous media field with six layers:

| Layer | Role |
| --- | --- |
| Atmosphere | Cream ground, changing brand-colour wash, grid and grain. |
| Continuity | The eight most recent completed segments, rendered as archive cards. |
| Focus | A central media portal for the current playing or generating segment. |
| Anticipation | The one or two generated/ready segments next in the queue, presented as a quiet “Coming up” cue. |
| Depth | Glossy spheres, oversized type and dotted routes; pointer and audio add subtle parallax. |
| Market chrome | Live bids, QR join, aggregate proof progress and the receipt. **Lowest priority on `/` in phase 1** — hide in theater mode for content-first demos. |

### Scene recipes

Every segment gets a stable layout from its ID, so it retains the same visual
identity after refresh or reconnect. Asset type influences the selection.

| Recipe | Best use | Composition |
| --- | --- | --- |
| Editorial | Audio or image-led story | Large framed portal with off-axis archive cards. |
| Orbit | Playful/brand-forward work | Circular portal and orbital memory objects. |
| Cascade | Generation and vertical stories | Tall portal with stacked archive cards. |
| Constellation | Quiet/open states | Smaller focal portal in a loose spatial field. |
| Cinema | Video | Wide rectangular stage with peripheral history. |

Recipes share the same palette, type, material and event language. They change
camera grammar, not brand identity.

### Future premium interactive creative

An interactive creative is a future premium format, not a new default backdrop.
It will occupy the same central portal as video, with a poster and media
fallback if preparation or playback fails. It must be visually coherent with
the Continuum while remaining technically contained in a restrictive player;
the product and safety rollout is in the [interactive creative
plan](../technical/interactive-creative.md).

### Event language

| Event | Screen response |
| --- | --- |
| `bid.outbid` | Leader colour shifts through the atmosphere; a ripple marks the displacement. |
| `segment.generating` | The selected portal becomes an assembly surface with visible stage progress. |
| `segment.playing` | The portal resolves to the asset and its stable scene recipe. |
| `attention.verified` | Aggregate proof progress increases; light/ripples can become denser, but no individual response is exposed. |
| `bid.cleared` | The proof receipt is the calm, legible focal point; the finished segment joins history. |

### Theater mode

`/?theater=1`, or the `T` key, hides navigation, stats and the
leaderboard while retaining the QR join prompt. This is the presentation and
projection mode: content remains primary, but joining is never blocked.

## Listener experience

The listener page is a pocket portal into the same world: colourful, reactive
and lightweight enough for a phone.

- **Listen mode** is the default. It plays the stream without challenge cards
  or challenge sounds.
- **Earn Mode** is a persisted explicit toggle. It enables proof opportunities
  for listeners who want rewards.
- A verified answer creates a **pending** reward. It becomes **available** only
  after the segment clears; the payout sheet explains that real payout rails
  are still a future capability.

The big screen may say that an Earn Mode opportunity is available, but the
question, choices, answer and personal receipt remain on the listener device.

## Navigation and responsive behavior

All three product surfaces share a role-aware navigation system: Screen (01),
Listen (02) and Brand (03). Desktop uses the surface switcher; smaller screens
get a thumb-reachable dock. The screen can deliberately suppress both in
theater mode.

On narrow displays, media portal recipes collapse to one reliable central
composition and archive cards withdraw rather than competing with the current
asset. When the stream is between segments, archive cards use a slower idle
drift so the Continuum still breathes. Reduced-motion preferences disable
continuous drift and ripple loops.

## Implementation guardrails

- **Default to video (or image + audio) for big-screen segments.** Audio-only tiers are a fallback for cost constraints, not the Continuum ideal; when audio-only plays, the portal shows abstract colour/motion — not editorial typography.
- Keep active video to one central surface. History uses image or muted video thumbnails, not text cards.
- `recentSegments` is snapshot-backed, newest-first, and capped at eight. It
  makes reconnect recovery visual as well as functional.
- `upcomingSegments` is a small snapshot-backed queue, not a promise of a
  fixed playback order. It gives the screen a “Coming up” cue without
  competing with the active portal.
- Scene recipes must be deterministic; random layout on refresh weakens the
  sense of a persistent world.
- Brand palettes can colour the atmosphere and event effects, but readable
  content keeps the cream/ink contrast system.
- WebGL/WebGPU effects are optional enhancement layers. They must not become a
  prerequisite for rendering the media world.

## Historical prototype

The earlier R3F metaball/Rapier build remains documented in
[3d-overhaul-plan.md](../hackathon/3d-overhaul-plan.md). It is useful as a
record of experiments and a source of future material effects, but it is not
the current screen architecture.
