# Main Surfaces

Slopstream has three main surfaces: the big screen (the centerpiece), the listener client, and the brand bidding console. Plus one signature artifact: the proof receipt.

The full visual and interaction design language — the living canvas aesthetic, audio-reactive backgrounds, fluid event reactions, per-brand color palettes, and the pragmatic build stack — is in [design-language.md](design-language.md). This document specifies _what_ is on each surface; the design language specifies _how it behaves_.

## A. The big screen

The centerpiece of the demo. Not a dashboard — a **living canvas**: a lava lamp crossed with a stock exchange, alive and colorful, constantly reacting to the market.

The screen shows:

```text
LIVE SLOPSTREAM
┌──────────────────────────────────────────────┐
│                                              │
│              NOW PLAYING                     │
│                                              │
│          [AI GENERATED AD]                   │
│     (full-screen, audio-reactive bg)         │
│                                              │
│  ~~ previous segments recede behind ~~~      │
├──────────────────────────────────────────────┤
│                                              │
│ 🔴 LIVE ATTENTION MARKET                     │
│                                              │
│  ┌─────────────────────┐  $47.20             │
│  │ ACME AI    (blue)   │                     │
│  └─────────────────────┘                     │
│  ┌─────────────────────┐  $38.50             │
│  │ COOLSTARTUP (orange)│                     │
│  └─────────────────────┘                     │
│  ┌─────────────────────┐  $24.10             │
│  │ DOGFOOD AI (purple) │                     │
│  └─────────────────────┘                     │
│                                              │
│       NEXT SLOT: $48.00                      │
│                                              │
├──────────────────────────────────────────────┤
│ 👀 1,284 listeners                            │
│ ✓ 927 attention proofs                       │
│ 💰 $182.40 listener rewards                  │
└──────────────────────────────────────────────┘
```

Brand entries are **colored, semi-transparent floating chips** that bob with subtle physics — not table rows. The background is a **living gradient** driven by the current ad's audio, tinted to the current brand's color palette. Previous segments recede behind the current ad with perspective and blur — the Continuum as a spatial trail, not a playlist.

When a brand gets outbid, the screen's color **washes** from the old leader's palette to the new leader's, the displaced chip wobbles and drops, the new leader's chip swells and glows, and a splash particle effect ripples outward:

```text
⚡ OUTBID ⚡

(color washes from blue → orange)

COOLSTARTUP
$31 → $38

NOW MOVING TO NEXT SLOT
```

See [design language](design-language.md#a-the-big-screen--a-living-canvas-not-a-scoreboard) for the full event-to-screen behavior spec.

## B. The listener experience

The listener joins by **scanning a QR code**. No app download. Just a mobile web page — bright, bouncy, and game-show-like.

Listener screen (while listening, with audio-reactive visualizer):

```text
SLOPSTREAM

You're listening to:
ACME AI

(audio-reactive visualizer pulses
 with the stream audio, tinted
 to Acme's brand color)

Attention reward pool:
$8.00

Live attention meter:
127 / 143 verified
██████████████████░░
```

A challenge suddenly appears — popping in with spring physics, haptic vibration, and a sound:

```text
┌─────────────────────────────┐
│ 👀 ATTENTION CHECK          │
│                             │
│ What did Acme's AI mention? │
│                             │
│ ┌─────────────┐             │
│ │ PostgreSQL  │             │
│ └─────────────┘             │
│ ┌─────────────┐             │
│ │ MongoDB     │             │
│ └─────────────┘             │
│ ┌─────────────┐             │
│ │ MySQL       │             │
│ └─────────────┘             │
│ ┌─────────────┐             │
│ │ Redis       │             │
│ └─────────────┘             │
│                             │
│ ⏱ 14s remaining             │
└─────────────────────────────┘
```

Correct answer — the proof receipt floats in as the calm center:

```text
✓ ATTENTION VERIFIED

Proof generated privately.

Estimated reward:
~$0.37 (pending pool close)
```

Then the ad continues. See [economics](economics.md) for how the estimated reward becomes a pool share, [content](content.md) for challenge design, and [design language](design-language.md#b-the-listener-client--playful-urgent-satisfying) for the full interaction behavior.

## C. The brand bidding console

Brands get a bidding console — one that conveys live auction pressure, not form-filling:

```text
YOUR BALANCE

$500.00

ACTIVE CAMPAIGN

Acme AI

CURRENT SLOT
#4

CURRENT LISTENERS
1,284

YOUR BID
$27

CURRENT WINNING BID
$31  ← pulses when it changes

[ INCREASE TO $35 ]

~$0.026 / verified attention
(at 1,284 listeners, 60% threshold)

⏱ slot closes in 23s

────────────────────

PRODUCTION TIER

┌──────────┐  ┌──────────────┐
│ $1–$5    │  │ $5–$20       │
│ Audio    │  │ Audio + Image│
└──────────┘  └──────────────┘
┌──────────┐  ┌──────────────┐
│ $20–$50  │  │ $50+         │
│ Video    │  │ Premium      │
└──────────┘  └──────────────┘
```

The console surfaces **current listener count** alongside the standing bid, because slot value scales with audience size (see [auction strategy](economics.md#audience-size-is-slot-value--and-its-not-in-the-auction-yet)). A brand should be able to reason about cost-per-verified-attention, not just nominal bid amount.

The **current winning bid pulses** when it changes. When the brand is outbid, the console flashes an OUTBID alert (matching the big screen's color wash) and vibrates if on mobile. A **slot countdown timer** creates urgency — the auction isn't open-ended.

The bid controls more than position. Higher bids can unlock:

- better generation quality
- longer slots
- image generation
- video generation
- interactive formats
- premium placement
- more elaborate story integration

This matches the free/low → image → video production escalation in the [generation pipeline](../technical/architecture.md#generation-pipeline). See [design language](design-language.md#c-the-brand-bidding-console--stakes-and-pressure) for the full interaction behavior.

## D. The proof receipt

Every verified interaction produces a beautiful receipt — the one calm moment in the slop. A translucent card that floats above the chaos, the signature artifact judges will screenshot:

```text
┌─────────────────────────────┐
│ ✓ ATTENTION VERIFIED        │
│                             │
│ ACME AI                     │
│ Segment #392                │
│                             │
│ Challenge: RECALL           │
│ Result: VALID               │
│                             │
│ Listener: PRIVATE           │
│ Session: PRIVATE            │
│                             │
│ Proof: 0x8F29...            │
│                             │
│ ESTIMATED REWARD            │
│ ~$0.37 (pending pool close) │
│                             │
│ VERIFIED BY MIDNIGHT        │
└─────────────────────────────┘
```

The receipt animates in: card fades and scales up with a spring, "ATTENTION VERIFIED" stamps in as a rotating seal, the proof hash types in character by character, and the reward amount counts up from $0.00. See [design language](design-language.md#d-the-proof-receipt--the-calm-center) for the full animation sequence.

This is the moment to demonstrate **why Midnight exists**. The audience doesn't need to understand the cryptography first. They see:

> I answered → proof → reward.

The reward is an _estimate_ until the attention window closes and the pool is distributed proportionally (see [economics](economics.md#dont-pay-per-question)) — the receipt shows a pending share, not a settled payout.
