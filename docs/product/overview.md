# Product Overview

## One-liner

Slopstream is a live, infinite AI-generated advertising stream — **The Continuum** — where absurd stories evolve segment by segment, listeners can opt in to earn by proving attention, and brands eventually bid to sponsor beats in that world.

The long-term marketplace clears spend only after verified attention and shares up to 80% with listeners. **That economy is real, but it is not phase one.** Phase one is making the free stream so immersive and enjoyable that people leave it on.

## North star (phase 1)

> **Free, immersive, fun.**

The product we are trying to get right first:

- An **unbroken** AI ad stream that never feels empty or boring
- **Continuity** — story, visual, and format rotation so each beat feels like the same absurd universe mutating forward
- **Enjoyable ads** — funny, surprising, watchable; the kind of slop people quote to friends
- **Invitation, not interruption** — Earn Mode and challenges are opt-in; the default experience is passive watching

Nobody will bid until the baseline pipeline and creative quality are **incredibly good**. Bidding is a monetization layer on top of a stream people already love — not the thing that turns the lights on.

```text
WRONG FRAMING (what we built first):

  Auction → (maybe) segment → (maybe) fun ad

RIGHT FRAMING (what we are optimizing for):

  Fun ad stream → (optional) sponsored beat
```

See [content.md](content.md) for The Continuum and [economics.md](economics.md#phased-rollout) for when the marketplace enters.

## The core idea

Traditional advertising:

```text
Advertiser → platform → impression → hope someone paid attention
```

Slopstream's **eventual** model:

```text
Advertiser → Slopstream → verified attention → listener reward
```

Brands don't simply buy impressions. **They compete for verified human attention** — but only after the stream itself is worth watching.

What ships first:

- The stream is **continuously populated** with free AI-generated Continuum segments (fictional brands, scraped startups, running story arcs).
- Production quality, format variety, and continuity are the primary investments.
- While listening, viewers who enable Earn Mode occasionally receive lightweight attention challenges (full taxonomy in [content](content.md#randomized-attention-challenges)).
- Cryptographic proofs gate when paid spend clears and listener pools are created.

What comes later:

- Brands **sponsor** upcoming beats — entering the running story, upgrading tier, or buying a named slot — rather than being the sole reason a segment exists.

## What makes Slopstream different

Old advertising:

> Pay for impressions.

Slopstream (mature):

> Pay for verified attention.

Old media:

> Audience watches → advertiser gets value.

Slopstream:

> Audience watches → audience gets value too.

That's the interesting part of the 80% idea. The listener is no longer merely the product — they're a participant in the marketplace.

**But the hook that gets anyone to care in the first place is not the marketplace.** It is The Continuum: infinite, evolving, AI-generated ad fiction delivered as **short audio–video beats** — voice carries the line, picture carries the placement, minimal on-screen text.

## Positioning

Describe Slopstream to users and judges in phase 1 as:

> **An infinite AI ad stream that keeps getting weirder.**

Describe the business model (when ready) as:

> **A live marketplace for human attention** — brands sponsor beats in a stream people already watch; AI creates the content; humans prove they paid attention; Slopstream shares the resulting value with them.

Not "AI advertising platform." Not "blockchain advertising." Not "ad-supported streaming." Those are implementation details.

## Phased rollout

| Phase | Focus | Success looks like |
| --- | --- | --- |
| **1 — Continuum** | Unbroken free stream, great generation, continuity, archive world | People watch multiple segments; stream never stalls; ads are enjoyable |
| **2 — Sponsorship** | Brands pay to enter the story (tier upgrades, named beats, claim flow) | Companies discover ads made for them; first voluntary spend |
| **3 — Marketplace** | Auctions, clearing, attention proofs, 80/20 pools | Verified spend clears; listeners earn; full economic loop |

The hackathon codebase is **auction-scheduled** today (a slot closes → a segment is realized). That was a reasonable engineering shortcut, but it inverted the product priority. The target architecture decouples **playback** from **auctions**: always keep segments generating and ready; auctions assign *who sponsors the next beat*, not *whether there is a next beat*. See [architecture](../technical/architecture.md#stream-scheduling-product-direction).

## The most important product principle

**Don't build an ad platform with a crypto component.**

Build something people want to watch — then build a human-attention marketplace where cryptographic verification makes that marketplace trustworthy.

The 80/20 split makes the mature product much stronger (full model in [economics](economics.md)):

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
          │    AI AD STREAM   │  ← phase 1: mostly free Continuum
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

For hackathon demos, lead with Continuum quality in **theater mode** when the story is "watch this world." Use the full marketplace demo when the story is "here is how money clears." Both are true; phase 1 priority is the first.

## Future direction: proof-of-use and the agent channel

The hackathon builds the human attention market. The same proof infrastructure points at a second market — one that is explicitly **not in scope** for the build, but worth naming because it's where the thesis naturally extends.

### The idea

Right now only humans listen and prove attention. But developers building agents and applications could tap into the same generated content and brand metadata — not to "listen to ads," but to **discover products relevant to what they're building**. The compelling version isn't "let bots listen to the stream." It's: an agent queries a structured discovery API, finds a relevant product, integrates it into a real project, and proves it did so. The developer earns a micropayment (x402-style, HTTP-native) for verified product use.

### Proof-of-use: the agent-side trust primitive

The human channel's trust primitive is proof-of-attention: a listener answered a challenge correctly under verifiable conditions. The agent channel's equivalent is **proof-of-use**: an agent actually integrated the advertised product in a real project.

```text
HUMAN CHANNEL                    AGENT CHANNEL

scarce: human attention          scarce: real product integration
proof:  attention challenge      proof:  product integration + verified users
pay:    internal listener balance pay:    x402 micropayment on verified use
rail:   Stripe (dollars)          rail:   x402 (machine-native)
```

Proof-of-use is a three-party protocol — the developer's agent, Slopstream, and the advertised product (which must sign "yes, this project integrated me"). That product-side cooperation is what makes it hard to fake: a self-reported integration is trivially gameable, but a product-signed receipt is not. Products that want agent-channel discovery integrate a Slopstream proof-of-use SDK — which is itself a commitment signal.

### The hard problem: verifying real users privately

Proof-of-use alone has the agent equivalent of "opening dozens of tabs": a developer creates a throwaway project that imports the product purely to collect the micropayment. The defense is verifying that the project has **real users** — and doing so privately:

```text
Agent integrates product X in project Y
Project Y has ≥ N users (attested)
Agent submits proof-of-use
  → reveals: product X used, user count ≥ N (threshold)
  → hides:   project Y's identity, users' identities, integration details
Midnight verifies → x402 micropayment flows to developer
```

The user-count attestation is the research question. Options range from third-party attestation services (pragmatic, requires trust) to on-chain proof (zero-trust, narrow applicability) to distributed user attestation (scalable, reintroduces the multi-account problem). **"Cryptographically verified proof that a product was used in a project with real users, without revealing the project or the users"** is a genuine ZK use case that extends the existing Midnight infrastructure into a second market. If solved, it's a trust signal no generic ad API or sponsored-listings service can offer.

### Why it's the same thesis, not a different product

Slopstream is "a marketplace for attention." The human channel sells verified human attention to brands. The agent channel sells verified product use to brands. Same buyer (brands), same content pipeline (AI-generated ads + structured metadata), same brand accounts and budget — different scarce resource, different proof primitive, different payment rail. The agent channel reuses the generation pipeline, the brand ledger, and the Midnight proof infrastructure; it adds a new proof type and a new payment rail.

### What's not in scope

- Agent reads **never clear an attention bid or mint listener rewards.** Different rail entirely. Conflating the two destroys the human channel's value proposition.
- The agent channel can't borrow proof-of-attention as its trust primitive. It needs proof-of-use plus user verification — a distinct circuit.
- **Prompt injection at scale.** The moment agents ingest brand-authored content, that content becomes an injection payload aimed at the developer's agent. Mitigation: serve agents structured, sanitized fields (enum categories, numeric tiers, short validated claim strings) — never raw generated prose — and mark all content as untrusted third-party data.
- The proof-of-use protocol, product-side SDK, user-verification circuit, and x402 integration are each multi-day efforts. This is a post-hackathon direction, captured here so the thesis is visible, not so it gets built this weekend.
