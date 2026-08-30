# Main Surfaces

Slopstream has three main surfaces: the big screen (the centerpiece), the listener client, and the brand bidding console. Plus one signature artifact: the proof receipt.

## A. The big screen

The centerpiece of the demo. This should feel closer to a **live sports scoreboard / stock exchange** than an advertising dashboard.

The screen shows:

```
LIVE SLOPSTREAM
┌──────────────────────────────────────────────┐
│                                              │
│              NOW PLAYING                     │
│                                              │
│          [AI GENERATED AD]                   │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│ 🔴 LIVE ATTENTION MARKET                     │
│                                              │
│  #1  ACME AI             $47.20              │
│  #2  COOLSTARTUP         $38.50              │
│  #3  DOGFOOD AI          $24.10              │
│                                              │
│       NEXT SLOT: $48.00                      │
│                                              │
├──────────────────────────────────────────────┤
│ 👀 1,284 listeners                            │
│ ✓ 927 attention proofs                       │
│ 💰 $182.40 listener rewards                  │
└──────────────────────────────────────────────┘
```

When a brand gets outbid:

```
⚡ OUTBID ⚡

COOLSTARTUP
$31 → $38

NOW MOVING TO NEXT SLOT
```

## B. The listener experience

The listener joins by **scanning a QR code**. No app download. Just a mobile web page.

Listener screen:

```
SLOPSTREAM

You're listening to:
ACME AI

Attention reward pool:
$8.00

Stay tuned.
Questions can appear at any time.
```

A challenge suddenly appears:

```
┌─────────────────────────────┐
│ 👀 ATTENTION CHECK          │
│                             │
│ What did Acme's AI mention? │
│                             │
│ ○ PostgreSQL                │
│ ○ MongoDB                   │
│ ○ MySQL                     │
│ ○ Redis                     │
└─────────────────────────────┘
```

Correct answer:

```
✓ ATTENTION VERIFIED

Proof generated privately.

Estimated reward:
+$0.37
```

Then the ad continues. See [economics](economics.md) for how the estimated reward becomes a pool share, and [content](content.md) for challenge design.

## C. The brand bidding console

Brands get a bidding console:

```
YOUR BALANCE

$500.00

ACTIVE CAMPAIGN

Acme AI

CURRENT SLOT
#4

YOUR BID
$27

CURRENT WINNING BID
$31

[ INCREASE TO $35 ]

────────────────────

PRODUCTION TIER

$1–$5
Audio

$5–$20
Audio + Image

$20–$50
Video

$50+
Premium / Interactive
```

The bid controls more than position. Higher bids can unlock:

- better generation quality
- longer slots
- image generation
- video generation
- interactive formats
- premium placement
- more elaborate story integration

This matches the free/low → image → video production escalation in the [generation pipeline](../technical/architecture.md#generation-pipeline).

## D. The proof receipt

Every verified interaction should produce a beautiful receipt:

```
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
│ REWARD RELEASED             │
│ +$0.37                      │
│                             │
│ VERIFIED BY MIDNIGHT        │
└─────────────────────────────┘
```

This is the moment to demonstrate **why Midnight exists**. The audience doesn't need to understand the cryptography first. They see:

> I answered → proof → money.
