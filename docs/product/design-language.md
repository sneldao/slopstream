# Design Language: A Living Canvas

Slopstream is not a dashboard. It is a living, colorful, fluid canvas — an art installation that happens to be a marketplace. The product is named after slop: gooey, liquid, flowing abundance. The UI should *be* slop.

## Visual references

Four projects define the direction:

- **[Floaty](https://github.com/matsuoka-601/Floaty)** — soft-body and fluid simulation. The soul of Slopstream: things squish, flow, splash, and react with playful physics. OUTBID is a splash. A cleared bid bursts into reward droplets. The attention threshold is a liquid filling up, not a striped progress bar. Brand mascots are soft-body blobs competing for the slot.
- **[Infinite Canvas](https://github.com/edoardolunardi/infinite-canvas)** — a 3D media space you drift through. Infinite Slop becomes spatial: the current ad is center-stage, previous segments (the robot escaping the lab, getting hired, hitting Shark Tank) recede behind it in a navigable grid. The continuity story is a *place*, not a playlist.
- **[Spotify Visualiser](https://github.com/J0SUKE/spotify-visualiser)** — audio-reactive GLSL. The stream's heartbeat: the background pulses with the voiceover, colors shift per brand, generation stages ripple outward. The room feels the stream even when nobody's looking directly at it.
- **[Codrops Interactive Grid](https://github.com/samueljarry/codrops-tutorial-grid)** — tactile grid grammar. Hover-distortions on brand tiles, image grids that warp and respond, tactile feedback on every touchable thing.

## The aesthetic

- **Not dark, not white — saturated and shifting.** The background is a living gradient that takes on the current brand's color identity. When Acme's ad plays, the screen is in Acme's blues. When CoolStartup outbids them, the screen floods with CoolStartup's orange. The color transition *is* the OUTBID moment — paint washes across the screen.
- **System fonts, not monospace.** Monospace reads as "developer tool." Slopstream reads as "playful marketplace." Use a clean sans-serif system stack with bold weights for emphasis.
- **High contrast text.** White or near-black depending on background luminance. The leaderboard entries are colored chips, not table rows.
- **One calm moment.** The proof receipt is the one place that stays still — a clean, slightly translucent card that floats above the chaos. It's the moment of certainty in the slop.

## The pragmatic build stack

Real Floaty is a research-grade Rust + WASM fluid simulation (Position Based Dynamics / Position Based Fluids). Integrating it into a Next.js app and wiring it to Slopstream events is a multi-day project on its own, and if it drops frames during the demo, the "living canvas" becomes a "stuttering mess" — worse than a clean static UI.

The pragmatic version fakes the *feeling*, not the physics. 80% of the sensation at 20% of the complexity:

| Feeling | Implementation | Complexity |
| --- | --- | --- |
| **Squish** | Framer Motion spring physics. Every element uses `type: "spring"` with soft stiffness. Bids bounce into the leaderboard, brand blobs wobble when outbid, the challenge card pops with overshoot. | ~5 lines per element |
| **Flow** | Canvas 2D particle system. When a bid clears, spawn particles at the bid amount that flow toward the listener pool, splitting into two streams (80% / 20%) as they go. | ~100 lines, one animation loop |
| **Audio reactivity** | Web Audio API `AnalyserNode` → frequency data → reactive CSS gradient or simple GLSL shader on the background. The background breathes with the audio. Per-brand color palettes mean the whole screen takes on the current advertiser's identity. | ~200 lines |
| **Spatial depth** | CSS 3D transforms or minimal React Three Fiber. Previous segments recede with perspective + blur. The current ad is full-screen front. No chunk-based rendering or WASD navigation needed — just depth. | CSS transforms or a small R3F scene |

This stack (Framer Motion + Canvas 2D + Web Audio + CSS 3D / minimal R3F) runs in any browser, doesn't need WASM, and one developer can build it in a weekend. Real Floaty-grade fluid simulation is a P2 "if we have time" upgrade.

### Dependencies to add

- **Framer Motion** — spring physics, layout animations, gesture handling. The single biggest leverage for "dynamic and engaging" with minimal code.
- **React Three Fiber + Three.js** (P1) — for the infinite-canvas spatial depth and Three.js grid interactions. Not needed for P0 if CSS 3D transforms suffice, but enables the full vision.
- **Tailwind CSS** — styling speed. No custom CSS files, utility classes, responsive by default. Lets Lane 3 move fast on visual polish without writing selectors.

## Per-surface behavior

### A. The big screen — a living canvas, not a scoreboard

The big screen is the centerpiece. It should feel like a lava lamp crossed with a stock exchange — alive, colorful, and constantly reacting to the market.

**The spatial stream.** The current ad plays full-screen, center-stage. Previous segments recede behind it with perspective and blur — the Infinite Slop continuity is visible as a trail of receding media. The audience can see the story they've been watching literally fading into the background behind the current ad.

**The audio-reactive background.** A living gradient driven by the ad's audio. Frequency data from the Web Audio API modulates the gradient's intensity and hue. When the voiceover hits a dramatic moment, the background pulses. Per-brand color palettes mean the screen takes on the current advertiser's identity — Acme's deep blue, CoolStartup's vibrant orange, Dogfood AI's electric purple.

**The leaderboard as floating chips.** Brand entries are colored, semi-transparent chips that float and bob with subtle physics. When a brand gets outbid, its chip wobbles and slides down. When a new bid arrives, the chip springs into position. Ranks re-sort with a smooth shuffle, not an instant snap.

**The OUTBID moment.** This is the signature animation. When a brand is overtaken:

1. The screen's color washes from the old leader's palette to the new leader's palette (paint flowing across).
2. The displaced brand's chip wobbles and drops.
3. The new leader's chip swells and glows.
4. A splash particle effect ripples outward from the new bid amount.
5. "OUTBID" text bursts in with spring overshoot, then settles.

**The attention threshold as liquid.** Not a striped progress bar. A container filling with liquid — the verified count rises, the liquid level rises, it sloshes slightly when it hits the threshold. When the threshold is met, the liquid glows and the "$18 CLEARED" moment fires.

**The clearing animation.** When a bid clears:

1. The full bid amount appears as a glowing number.
2. It splits into two particle streams — 80% flows toward "LISTENER REWARD POOL" (in the brand's color), 20% flows toward "SLOPSTREAM" (in a neutral/platform color).
3. The pool counter ticks up as particles arrive.
4. The listener rewards footer stat counts up smoothly.

**The generation sequence.** While an ad generates:

1. "GENERATING AD..." with a fluid loading indicator.
2. Each stage (script, voice, image, video) checks off with a small splash particle effect as `generation.progress` events arrive.
3. When `segment.ready` fires, the checklist dissolves and the ad transitions in.

**The stats footer.** Three stats (listeners, attention proofs, listener rewards) are always visible at the bottom. Numbers count up smoothly, never snap. When a new listener joins (QR scan), the listener count pulses and a brief "NEW LISTENER" ripple appears. This makes the audience feel their participation is visible.

### B. The listener client — playful, urgent, satisfying

The listener experience should feel like a game show on a phone — bright, bouncy, and responsive.

**Joining.** After QR scan, the listener sees a brief splash animation as they "enter the stream." The big screen's listener count ticks up simultaneously (if the listener looks up, they see themselves arrive).

**While listening.** An audio-reactive visualizer on their phone — a simple waveform or blob that pulses with the stream audio. Not a static "you're listening to" screen. The brand's color palette tints their screen, matching the big screen.

**Challenge appearance.** The challenge card pops in with spring overshoot, accompanied by a haptic vibration and a short sound. A countdown timer (driven by `validFrom` / `validUntil`) creates urgency — the timer ring depletes visibly. The challenge options are large, colorful tappable buttons, not radio inputs.

**Correct answer.** The card bursts into the proof receipt — the one calm moment. The receipt floats in as a translucent card above the visualizer. The proof hash types in character by character. The estimated reward amount counts up. A subtle "VERIFIED BY MIDNIGHT" stamp effect seals it. Then the receipt fades and the stream continues.

**The live attention meter.** While challenges are active, the listener sees the collective progress — "127 / 143 verified" — as a liquid fill matching the big screen's threshold visualization. They feel the collective event, not just their own answer.

### C. The brand bidding console — stakes and pressure

The brand console should convey that you're in a live auction against other brands, not filling out a form.

**Live bid pressure.** The current winning bid pulses when it changes. When the brand is outbid, the console flashes an OUTBID alert (matching the big screen's color wash) and vibrates (if on mobile). The brand should feel the pressure of being overtaken in real time.

**Cost-per-verified-attention estimate.** Using the surfaced listener count: "~$0.026 / verified attention at 1,284 listeners and 60% threshold." This makes the bid feel real — not just a number, but a price for something measurable.

**Slot countdown.** A visible timer to when the current slot closes and generation begins. The auction isn't open-ended; there's a window, and it's closing.

**Tier selection as tactile chips.** The production tiers (audio / audio+image / video / premium) are colorful tappable chips, not a static table. Selecting a tier tints the console with that tier's accent color.

**Bid confirmation.** When a bid is placed, a particle effect flows from the brand's chip toward the leaderboard — the brand can see their bid "arriving" in the market.

### D. The proof receipt — the calm center

The signature artifact. The one moment of stillness in the slop. It should feel like a certificate or a physical receipt — slightly translucent, floating above the chaos, monospace for the proof hash only (everything else is sans-serif).

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

| Event | Big screen | Listener client | Brand console |
| --- | --- | --- | --- |
| `bid.placed` | New chip springs into leaderboard, amount flashes | — | Bid confirmation particle effect |
| `bid.outbid` | Color wash to new leader, OUTBID splash, chips re-sort | — | OUTBID alert, vibration, bid pressure pulse |
| `leaderboard.updated` | Chips shuffle with spring physics, next-slot price ticks | — | Winning bid updates with pulse |
| `segment.generating` | "GENERATING..." with fluid loader | "Next ad coming..." with subtle animation | — |
| `generation.progress` | Stage checks off with splash particle | — | — |
| `segment.ready` | Checklist dissolves, ad transitions in | — | — |
| `segment.playing` | Ad full-screen, audio-reactive background activates, brand color palette floods screen | Audio visualizer activates, screen tints to brand color | — |
| `challenge.fired` | Challenge banner overlay on big screen | Challenge card pops in with spring + haptic + sound, countdown timer starts | — |
| `attention.verified` | Verified counter ticks up, liquid threshold fills, pulse effect | Attention meter updates, personal verified indicator | — |
| `bid.cleared` | Full-screen "$18 CLEARED", particle split into 80/20 streams, pool counter ticks up | — | Bid cleared confirmation |
| `bid.uncleared` | "THRESHOLD NOT MET" — somber but clear, bid returned | — | Bid returned notification |
| `reward.pool.updated` | Listener rewards stat counts up | Estimated reward updates on receipt | — |
| `stats.updated` | All footer stats count up smoothly | — | — |

## Color system

**Per-brand palettes.** Each brand defines a primary and secondary color when creating a campaign. These colors drive:

- The big screen's background gradient while the brand's ad plays
- The brand's leaderboard chip color
- The listener client's tint during the brand's segment
- The brand console's accent color
- The particle stream colors when the brand's bid clears

**Platform colors.** Slopstream's own identity uses a vibrant, saturated base — not a single brand color but a neutral-yet-living gradient (think: shifting aurora). The platform's 20% share in the clearing animation uses a neutral accent (white or pale gold) to distinguish it from any brand's color.

**Threshold/certainty colors.** The attention threshold liquid shifts from warm (filling, in progress) to bright (threshold met, cleared). The proof receipt uses a calm, high-contrast white-on-translucent regardless of brand color — certainty has no brand.

**Transition colors.** The OUTBID color wash is the most dramatic moment: the old leader's palette drains out as the new leader's palette floods in. This should take ~600ms — fast enough to feel instant, slow enough to feel like paint flowing, not a snap.
