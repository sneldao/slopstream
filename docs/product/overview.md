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
