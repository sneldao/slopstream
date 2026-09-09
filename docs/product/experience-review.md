# Experience Review: Immersion, Cohesion, Memorability

A cross-surface audit of `apps/web` against the ambition in
[design-language.md](design-language.md) and [surfaces.md](surfaces.md), through
four lenses: UI/UX, product design, motion design, and styling/performance.
Every claim is verified against the code; citations are `file:line`.

## The verdict

The bones are unusually good. The design language is documented with real
opinions, the token system has a stated philosophy, the 60fps-without-React
architecture (CSS custom properties written from rAF loops, React never
re-rendering) is the _correct_ way to build a living screen, and the
engineering discipline (snapshot healing, idempotency keys, preload strategy,
error boundaries) is above hackathon average.

The gap between the doc's ambition and the shipped experience is **concentrated
and fixable**. It lives in four places:

1. **The typographic identity only exists on Apple devices.**
2. **Three signature event moments are under-tuned or silently broken** — the
   palette flood, the OUTBID burst, and the proof receipt.
3. **The token/motion system is bypassed by the two highest-traffic surfaces**,
   so cohesion drifts exactly where traffic is.
4. **The most expensive rendering patterns sit on the exact moments that must
   not jank** — the timed challenge and the reward reveal.

None of these require new ideas. Nearly every fix is _convergent_: move things
into the system that already exists, and finish moments that are already
designed.

## What's already best-in-class — keep and amplify

- **The Continuum is the right world.** Cream ground, ink grid, glossy orbs,
  hard offset "sticker" shadows, giant outline type bands, dotted routes, grain
  (`globals.css:807-1505`). It is genuinely the homepage DNA grown into a
  gallery, not a dark sci-fi detour.
- **Deterministic scene recipes.** FNV-1a hash of the segment ID with a
  video→cinema override (`lib/continuumScene.ts:14-27`); five meaningfully
  different camera grammars, not recolors. Refresh-safe, reconnect-safe.
- **The motion architecture.** Pointer parallax and audio pulse write CSS vars
  from rAF (`Scene.tsx:182-218`); `AnimatedNumber` writes `textContent` from a
  MotionValue subscription. Zero re-renders at 60fps. This should be the
  template for everything new.
- **The market open/close is a camera metaphor, not a panel swap** — the portal
  pulls back while archive and orbs grow (`globals.css:1519-1541`). Keep the
  metaphor; fix its implementation (see performance).
- **The attention check is the best-built component in the app.** Bottom-anchored
  thumb-reach layout, 62px answer rows, late-joiner clock math, a documented
  focus rationale, transport-failure retry, and the brand-color contrast trap
  is _tested_ (`AttentionCheck.tsx`, `AttentionCheck.test.tsx:80-89`).
- **The brand console's OUTBID loop** — alert → sound → haptic → one-tap rebid
  CTA (`brand/page.tsx:213-249`) — converts adrenaline into action. Demo gold.
- **Sound design architecture**: synthesized oscillators, zero assets, lazy
  AudioContext unlocked on first gesture (`lib/useSoundDesign.ts`).
- **Reduced motion is triple-covered in CSS/Framer** (global reset, scoped
  Continuum reset, `MotionConfig reducedMotion="user"`).

## The five big moves

### 1. Give the typography a real font — the identity currently ships only to Apple

`--slop-display: "Avenir Next Condensed", …` (`globals.css:17-18`) is an
Apple-only stack. On Windows, Android, and projector Linux boxes the entire
display identity — wordmark, `--t-hero` challenge question, the portal's
`letter-spacing: -0.075em; line-height: 0.72` monument type — falls back to
generic sans-serif. Weights 650/750 assume a variable font that never loads.
The OG image uses a _third_ stack (`opengraph-image.tsx:25`), so even the share
card doesn't match the product.

This is the single biggest cohesion/memorability gap: **the visual thesis is
typographic, and the typography is a dice roll.**

**Do:** `next/font` with a self-hosted condensed variable grotesque
(`display: swap`, preload, `adjustFontFallback` or manual `size-adjust`
overrides so fallback metrics keep the tight tracking and 0.72–0.9 line-heights
intact). Align the OG image generator to the same face. Effort: hours. The
current no-webfont state is at least FOIT-free — keep it that way with
`size-adjust` rather than skipping fallbacks.

### 2. Make the three signature moments actually land

These are the moments a judge screenshots. All three are 80% built.

**a) The palette flood doesn't flood.** The doc's signature transition —
"the screen floods to the new leader's palette" — is implemented as
`transition: background` on a gradient (no-op; gradients don't interpolate) and
`transition: --brand-glow` on an unregistered custom property (no-op). The wash
_snaps_ (`globals.css:849, 2523-2525`; stale `FluidBackground` comment at
`page.tsx:64-70`). **Fix:** register `@property --world-a/--world-b` with
`syntax: "<color>"` and transition those, or cross-fade two wash layers with
opacity. ~8 lines; turns browser roulette into the signature moment.

**b) OUTBID is tuned for a stage that no longer exists.** The overlay uses
lighten/screen blending that reads on a dark stage but washes out on the cream
world; the displaced chip doesn't wobble-and-drop even though `BlobChip`
already has an `agitation` prop to do it (`SoftBlob.tsx:137-178`) — it just
isn't wired to `flash.flashId`. **Fix:** ink text with a hard offset shadow
(the portal frame's own language), multiply/high-saturation wash, wire the
chips. The spec for this exact choreography exists at `surfaces.md:54`.

**c) The receipts are missing their own signature.** The spec
(`surfaces.md:209-231`) is explicit: rotating seal, **proof hash typed
character-by-character**, count-up reward, "VERIFIED BY MIDNIGHT". The
big-screen receipt (`ProofReceipt3D.tsx`) has the seal and count-up but **no
proof hash at all** — the one element that says "Midnight" without a word of
explanation. It's also dark glass floating over the cream world (off-language),
and it has a real bug: `onAnimationComplete` returns a cleanup that
framer-motion ignores (`ProofReceipt3D.tsx:80-84`), so two clears within ~4s
let the first card's orphaned timer dismiss the second card early. On the
listener side, the proof sound fires at card entrance instead of syncing to the
seal stamp (~200ms later), and the pending→available transition — "your $0.37
just became real" — is never choreographed at all: no `clear` chime on the
device that earned it, no ledger pulse.

**d) While there:** the brand's clear moment — the moral payoff of the whole
loop ("80% of your spend went to listeners") — is a flat 13px dark-glass banner
that says "Viewer pool" (`brand/page.tsx:305-327`), off-language twice (the
docs say _listener rewards_; they never lead with the 80%). Restyle it as a
sibling of the listener's `proof-ticket` (ink border, notches, cream variant),
count up the listener-rewards figure, play the existing `clear` sound, and link
"See it on the big screen ↗". One product, both sides of the loop.

### 3. Reunify the cascade — the token system is bypassed where it matters most

The token philosophy in `globals.css:21-31` is excellent and self-aware. The
problem is enforcement:

- **~1,100 lines of inline `styles` objects** across the three pages, plus
  per-component objects. **74 hardcoded `rgba()` literals** (31 in `page.tsx`,
  32 in `brand/page.tsx`, 11 in `listen/page.tsx`) while veil/edge tokens sit
  unused — including near-misses like `rgba(8,8,18,0.64)` where
  `--veil-dark-2: rgba(8,8,18,0.58)` exists.
- Inline styles force **44 `!important`s** in the stylesheet (clustered in the
  HUD media queries) — two sources of truth resolved by specificity war.
- **Two greens for one meaning** on the same page: `#4ade80` for "(you)"
  (`brand/page.tsx:1159`) vs `var(--slop-lime)` in the header pill.
- **11 distinct framer-motion spring configs** vs 2 CSS easing tokens that
  never cross the CSS/JS boundary; exactly one JS call site uses the token
  easing (`AttentionCheck.tsx:138`). The documented enter/exit asymmetry is
  honored in CSS, ignored in JS.
- **~20 distinct z-index values** across two parallel numbering systems; the
  next overlay added is a coin flip.
- The brand console is **100% dark glassmorphism with zero sticker DNA** — no
  ink border, no hard shadow, no cream element outside shared nav. It looks
  like a different product's admin panel wearing Slopstream's header.

**Do:** migrate page-level `styles` objects into `globals.css` classes (this
alone deletes most of the `!important`s); add `lib/motion.ts` exporting three
named springs + the CSS easings as arrays (see motion system below); add a
documented `--z-*` ladder; add a token-coverage lint (reject raw `rgba(`, px
`fontSize`, px `letterSpacing` in TSX). The brand console needs one pass of
sticker DNA — the settlement ticket (move 2d) is the highest-leverage single
edit.

### 4. Fix the trust-breakers — small correctness bugs in the story moments

Cheap to fix, expensive to keep — each contradicts the product's own narrative
at the moment it matters most:

| Bug                                                                                                                                                                 | Why it hurts                                                                                                     | Fix                                                                                                                 | Effort    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| Settlement banner claims **rivals'** clears as yours — `lastSettlement` is global, payload has no `brandId` (`streamReducer.ts:414-473`, `shared/index.ts:670-680`) | In a multi-brand demo (the OUTBID scenario), one rival clear turns the console into a liar                       | Copy/sound fix now; add `brandId` to the event + gate first-person copy; render rival clears as neutral market news | Low / Med |
| QR join URL silently forces `?earn=1` and **persists it** (`listenerJoinUrl.ts:13-15`, `listen/page.tsx:76-82`)                                                     | Contradicts the product's first principle: "Earn Mode is a deliberate listener choice" (`design-language.md:18`) | Disclose on the splash ("Earn Mode is on — answer what you hear to earn") with a visible off-switch                 | Low       |
| "Muted" only mutes stream audio; UI sounds still fire (`useAudioSignal.ts:75-78` vs `useSoundDesign.ts`)                                                            | On a phone in a quiet room — the realistic demo scenario — a trust-breaking surprise                             | Pipe a muted flag into `useSoundDesign.play`                                                                        | Trivial   |
| Challenges are gated on `!receipt` and **die silently under the payout sheet** (`listen/page.tsx:466-476`; z-index 150 vs sheet 220)                                | Silent lost earnings on the earning surface                                                                      | Gate on `!payoutOpen`                                                                                               | 1 line    |
| Slot countdown shows red "0s" whenever no auction is open (`brand/page.tsx:147-160, 436-450`)                                                                       | Urgency that never turns off is urgency nobody believes; burns the red palette OUTBID needs to own               | Hide when `currentAuction` is null; escalate ≤10s amber / ≤5s red with a progress bar                               | Low       |
| Balance defaults to a **fake $500.00** and clearing the bid input renders `Estimated $NaN`— refs`brand/page.tsx:35`and`brand/page.tsx:399-433`                      | Money legibility is the console's job                                                                            | Skeleton until resolved; guard NaN, clamp + round on blur                                                           | Trivial   |
| Wallet lives in `sessionStorage` with no disclosure (`listen/page.tsx:622-647`)                                                                                     | "My money disappeared" on tab close, for an accumulate→cash-out product                                          | Move to localStorage or disclose session scope in the payout sheet                                                  | Trivial   |
| `ProofReceipt3D` orphaned-timer bug (move 2c)                                                                                                                       | The screenshot moment can dismiss itself early                                                                   | `useEffect` keyed on `burstId`                                                                                      | Trivial   |

### 5. Move rendering cost off the moments that must not jank

The performance architecture is right (rAF → CSS vars, compositor-only
transforms, `scaleX` meters). The violations are specific:

1. **Animated `filter: blur()` on the biggest element.** `continuum-arrive`
   animates `blur(18px)→0` on a ~58vw portal _with video_
   (`globals.css:1556-1567`); `ProofReceipt3D` tweens a blur filter _through
   JS_ on a card that also has `backdrop-filter` — double blur during the
   entrance. Replace with opacity cross-fades (two stacked layers, pre-blurred
   copy fading out).
2. **Backdrop-filter stacking: 26 declarations.** Up to ~10 live simultaneously
   in market-open mode, several over nearly-opaque cream where the blur is
   imperceptible. Keep it only where the backdrop is video in motion
   (`.attn__veil`, receipt card); pills get opaque veils. Cut ~10 → ~3.
3. **Layout-property animation in the signature transition.** The portal
   transitions `width/height/left` for 900ms — layout + paint every frame, and
   it re-rasterizes the 70px halo blur each frame. The comment already calls it
   a "camera pull-back" — cameras don't relayout. Fixed frame +
   `transform: scale()`. And `continuum-orb-drift` animates **`margin`** on
   6–9 orbs infinitely — permanent layout thrash; the memory-drift keyframes
   right below it already use `translate`. One-line-class fix.
4. **Ungated rAF loops.** Scene pulse, per-chip blob paths, and four canvases
   across surfaces — none check `prefers-reduced-motion`, `document.hidden`, or
   viewport visibility. Users who asked for stillness get perpetual motion;
   backgrounded phones burn battery. One shared rAF bus (the audio-signal loop
   is already the heartbeat), `IntersectionObserver` for offscreen canvases,
   one static frame when reduced.
5. **Full-screen `mix-blend-mode: soft-light` grain on all three surfaces**
   forces offscreen compositing of the whole stack every frame. Plain
   `opacity: 0.16` noise reads almost the same.
6. **Archive `<video muted loop>` elements download but never play** (no
   `autoPlay`, `Scene.tsx:537`) — up to 8 files fetched to show a static first
   frame. Use poster images for history; reserve video decode for the portal
   (also what `design-language.md:121` prefers).
7. **Listener-specific:** the full-screen `backdrop-filter` veils sit _over two
   live canvases_ during the timed challenge and the reward moment — the
   classic dropped-frame cocktail on Mali/Adreno GPUs. Pause the canvases while
   overlays are up (the veil is ≥0.88 opaque anyway). Size canvases from
   `clientWidth × min(devicePixelRatio, 2)` instead of fixed 440×900.

## A motion-design system, codified from what's already emergent

The language is "playful physics on a broadcast stage." Keep springs for
_objects with mass_ (chips, receipts, portals), tokens for _state changes_, CSS
keyframes for _ambient loops_. Codify, don't invent:

**Durations** — extend the existing pair into a scale:

| Token         | Value | Use                                           |
| ------------- | ----- | --------------------------------------------- |
| `--dur-tick`  | 120ms | meters, countdowns                            |
| `--dur-exit`  | 240ms | exits, ease-in (existing)                     |
| `--dur-enter` | 420ms | state entrances, ease-out (existing)          |
| `--dur-scene` | 900ms | camera moves: portal resize, market open      |
| ambient       | ≥12s  | keyframe loops only (drift, breathe, marquee) |

**Springs — pick three, name them, delete the other eight.** These are the
most-used existing configs, so adoption is rename-not-retune:

```ts
// lib/motion.ts
export const SPRING = {
  pop: { stiffness: 400, damping: 14 }, // number bumps, amount changes
  settle: { stiffness: 300, damping: 18 }, // chips, banners, confirmations
  gentle: { stiffness: 200, damping: 22 }, // panels, hero entrances
} as const;
```

**Choreography primitives** (all already exist somewhere — promote them):

1. **Wipe, don't fade** — the clip-wash (`scaleX` with asymmetric in/out,
   `globals.css:2346-2360`) and the OUTBID clip-path wash are the signature
   state-change move. Promote to a shared `<Wash>` / `.slop-wash` primitive.
2. **Stamp** — seal/portal arrivals: `scale 0→1, rotate -45→0`, spring `pop`,
   0.2–0.3s after the parent. One `Stamp` component.
3. **Count, never snap** — `AnimatedNumber` is canonical; route the three
   hand-rolled rAF counters (e.g. `ProofReceipt3D.tsx:176-196`, which
   re-renders every frame) through it.
4. **Ambient = CSS only** — anything `infinite` is a stylesheet keyframe loop;
   JS rAF is reserved for audio-signal-driven motion.
5. **Stagger 40–60ms** for list/rank changes (leaderboard `popLayout` is the
   reference).
6. **Scene transitions** use `--dur-scene` + `--ease-out-expo` on transform
   only.

**Sound–motion sync:** sounds should fire on the _visual_ beat, not the state
change — proof sound at seal-stamp contact, outbid crack at wash impact. The
cheapest form of polish, currently unsynced.

## Per-surface notes

### Big screen (`/`)

Beyond the big moves: **liberate the anticipation layer** — "Coming up" is
priority 2 in the doc's hierarchy but is gated behind the market toggle; render
a quiet one-line cue in the default view. **Rebuild idle as a real open
state** — between segments the screen shows a dark standby box; the first frame
a judge sees should be a world (revive the dotted `__open` composition or a
breathing constellation of archive cards), with `EmptyMarket` shrunk to one
kicker line. **Restyle the three dark-glass pieces** (Coming Up panel,
broadcast tag, connection badge) to cream/ink/hard-shadow — the biggest
cohesion win per line changed. **Archive to eight** positions per recipe (doc
says eight most recent; five exist). Make the portal index state-honest
("NOW PLAYING" / "ASSEMBLING" / "STANDBY").

### Listener (`/listen`)

Beyond the trust-breakers: add **focus management to both dialogs** (receipt
and payout sheet are `role="dialog"` but focus never moves in, no Escape — the
signature moment is invisible to screen readers; contrast the care
`AttentionCheck` shows). Shrink receipt dwell (10s → ~5s) or let it collapse
into a mini-dock so it stops suppressing challenges on busy streams. Haptics
per spec: vibrate on challenge _appearance_ and a distinct double-pulse on
proof verified (today only on answer pick; note iOS Safari ignores
`navigator.vibrate` — know this before an iPhone demo). Raise the earn/mute
pills from 36px to ≥44px touch targets. Guard `brandName` against dark brand
colors (the rule `AttentionCheck` already enforces). Fix session-bootstrap
error copy ("Unable to submit proof" before any proof exists). Add interaction
tests for the check timer and receipt — the riskiest logic is currently
untested (SSR markup snapshots only).

### Brand console (`/brand`)

Beyond 2d/4: **show reserved → spent** — the API already returns `reservedUsd`
(`apps/api/src/market.ts:53-54`) but the page types only `availableUsd`; while
leading, my reservation is invisible instead of feeling _held safely_. **Name
the rival in OUTBID** ("COOLSTARTUP outbid you — now $38.50") — the flash
already carries `newBrandId`; pure emotional upside for one line of plumbing.
**Gate bidding on connection** — the header says "Market offline" while the bid
CTA stays enabled. **Turn the price ladder into a value ladder** — one line of
"what you get" per tier from `surfaces.md:189-197`, a leader marker, and
disable chips the market minimum has passed instead of silently over-bidding.
Add +$1/+$5 increment chips (typing is the slow path in a 20s auction). On
mobile, the bid action column renders after the overview column — reorder or
extend the sticky range to 561–880px. Gate `StreamOpsHud` behind `?ops=1` — a
diagnostics readout doesn't belong on a customer-facing console.

## The roadmap, ordered by impact-to-effort

### Now (hours, no redesign) — the demo-safety pass

1. `@property` for `--world-a/--world-b` so the flood actually floods.
2. Fix the `ProofReceipt3D` timer bug; add the proof-hash typewriter line.
3. Settlement banner: "Listener rewards" copy + 80% framing + `clear` sound;
   gate challenges on `!payoutOpen`; make Muted mute UI sounds.
4. Countdown honesty (hide when no auction); kill the fake $500; guard the NaN.
5. `continuum-orb-drift`: `margin` → `translate`.
6. Disclose the QR earn-mode default on the join splash.
7. Focus management + Escape for the receipt and payout dialogs.
8. Pause listener canvases while full-screen veils are up.

### Next (a day) — the memorability pass

1. `next/font` condensed variable face + metric-tuned fallbacks + OG alignment.
2. Re-tune OUTBID for the cream world; wire chip agitation.
3. The brand clear moment becomes a proof-ticket sibling, with count-up and a
   big-screen link; listener pending→available celebration (chime + pulse).
4. `lib/motion.ts` (three named springs + token easings); migrate call sites;
   `--z-*` ladder; delete dead `.slop-canvas`; merge duplicate accent tokens.
5. Backdrop-filter diet (~10 → ~3); blur-entrance → cross-fade; grain without
   `mix-blend-mode`; archive posters instead of inert videos.
6. Cream/ink restyle of the three dark-glass pieces on the big screen; quiet
   Coming-Up cue in the default view; honest idle state.
7. Reserved→spent balance; rival-named OUTBID; connection-gated bidding;
   tier value copy; +$1/+$5 chips.
8. rAF gating (reduced-motion + `document.hidden` + IntersectionObserver) on
   one shared bus.

### Structural (days) — the cohesion lock-in

1. Migrate the three page-level `styles` objects into `globals.css` classes —
   deletes most of the 44 `!important`s and reunifies the cascade.
2. Semantic tone layer: `data-tone="light|dark"` on the shell with scoped
   veil/edge/text remaps, replacing per-component `--light` modifiers; set
   `color-scheme` per tone.
3. Portal scene transitions to transform-only (fixed frame + scale).
4. Token-coverage lint in CI (reject raw `rgba(`, px `fontSize`/`letterSpacing`
   in TSX).
5. Add `brandId` to settlement events (contract + API + reducer) for truthful
   first-person attribution.
6. Interaction tests for the challenge timer, focus management, and receipt.

### The one-sentence version

**The system is already designed — the win is enforcing it:** one real font,
three finished signature moments, tokens and springs used everywhere instead of
halfway, and rendering budget spent on the moments judges screenshot instead of
the chrome around them.
