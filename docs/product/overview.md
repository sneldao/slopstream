# Product Overview

## One-liner

Slopstream is a live, infinite AI-generated advertising stream where brands bid for attention, AI generates the ads in real time, and listeners earn rewards by proving they actually paid attention.

The platform receives advertiser spend, verifies listener attention privately, and distributes up to 80% of eligible advertising spend back to listeners as rewards.

## The core idea

Traditional advertising works roughly like this:

```text
Advertiser → platform → impression → hope someone paid attention
```

Slopstream flips the model:

```text
Advertiser → Slopstream → verified attention → listener reward
```

Brands don't simply buy impressions. **They compete for verified human attention.**

- The stream is continuously populated with AI-generated ads. Brands can bid for upcoming slots, escalating from simple audio to richer image/video experiences.
- While listening, viewers occasionally receive lightweight attention challenges: multiple-choice questions, "what did they just say?", fill-in-the-blank, true/false, image recognition, short phrase repetition, audio recognition, story continuity questions.
- If the listener successfully completes the challenge, Slopstream generates a cryptographic proof that the attention *condition* was satisfied (the proof attests to challenge completion under the required conditions — it isn't a claim that a human was subjectively paying attention).
- Only then does the corresponding advertising spend become verified/cleared spend.
- A portion of that spend goes to the listener.

## What makes Slopstream different

Old advertising:

> Pay for impressions.

Slopstream:

> Pay for verified attention.

Old media:

> Audience watches → advertiser gets value.

Slopstream:

> Audience watches → audience gets value too.

That's the interesting part of the 80% idea. The listener is no longer merely the product — they're a participant in the marketplace.

## Positioning

Describe Slopstream as:

> **A live marketplace for human attention.**

Not "AI advertising platform." Not "blockchain advertising." Not "ad-supported streaming." Those are implementation details.

The product concept is:

> Brands bid for attention. AI creates the content. Humans prove they paid attention. Slopstream shares the resulting value with them.

## The most important product principle

**Don't build an ad platform with a crypto component.**

Build a human-attention marketplace, where cryptographic verification happens to be the thing that makes the marketplace trustworthy.

The 80/20 split makes this much stronger:

```text
                 SLOPSTREAM

             ┌──────────────┐
             │    BRANDS    │
             └──────┬───────┘
                    │
                 bid $
                    │
                    ▼
          ┌───────────────────┐
          │    AI AD STREAM   │
          └─────────┬─────────┘
                    │
                 attention
                    │
                    ▼
          ┌───────────────────┐
          │  PROOF OF         │
          │  ATTENTION        │
          └─────────┬─────────┘
                    │
                 verified
                    │
                    ▼
             ┌─────────────┐
             │   $ REWARD  │
             └──────┬──────┘
                    │
              ┌─────┴─────┐
              ▼           ▼
          LISTENERS   SLOPSTREAM
             80%          20%
```

The proof isn't technical theater — it determines when real economic value gets unlocked. Keep the 80/20 concept front and center in the demo: it gives the judges an immediate reason to care about the attention proof.
