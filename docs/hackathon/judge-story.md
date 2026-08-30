# Judge Story and Demo Rehearsal

This is the speaking guide for a judge who sees Slopstream with no prior context. The goal is not to explain every subsystem. The goal is for the judge to understand the product, see it work, and remember why it matters.

**We initially over-indexed on the marketplace in docs and demos.** The corrected north star is phase 1: a free Continuum stream that is immersive and fun. This guide offers **two demo stories** — use the one that fits the room.

## The one sentence to optimize for

**Continuum demo (phase 1):**

> Slopstream is an infinite AI ad stream where each segment mutates the same absurd story forward — and listeners can eventually earn when brands sponsor beats and prove attention.

**Marketplace demo (phase 3):**

> Slopstream is an ad marketplace where brands pay only after people prove they engaged, and the audience receives a share of the resulting value.

A judge should be able to repeat one of these after the demo. If a detail does not reinforce the chosen story, cut it.

## First 10 seconds: audience, pain, payoff

### Continuum opening (preferred when stream quality is the proof)

> Most ads are disposable noise. Slopstream is a live AI stream that builds one ridiculous universe — each ad is the next chapter, and the screen remembers what came before.

### Marketplace opening (when running the full economic loop)

> Brands spend money on ads that people scroll past. Slopstream is a live attention market: brands bid for verified attention, and when listeners prove they engaged, they earn up to 80% of the cleared spend.

Do **not** start with AI, blockchain, Daytona, WebSockets, or zero knowledge. Those are mechanisms.

## The visible product loops

### Continuum loop

```text
WATCH → WORLD ACCUMULATES → NEXT BEAT SURPRISES
```

### Marketplace loop

```text
BRANDS BID → PEOPLE PROVE ATTENTION → VALUE UNLOCKS
```

## Recommended demo arcs

### Continuum arc (~90s) — theater mode on

| Time | Show | Say | What it proves |
| --- | --- | --- | --- |
| 0–15s | Archive + playing segment | "One evolving story — not a playlist of random ads." | Differentiation |
| 15–45s | Two segments, format shift | "Each beat gets a new voice and tone; the plot continues." | Creative pipeline |
| 45–70s | Generation assembly → ready | "The stream never goes silent — the next beat is always cooking." | Reliability |
| 70–90s | QR optional | "Listeners can watch for free; earn mode is opt-in when sponsors show up." | Invitation model |

### Marketplace arc (~100s) — full HUD

See the detailed [demo script](demo-script.md). Summary:

| Time | Show | Say |
| --- | --- | --- |
| 0–10s | Loop diagram | Problem and payoff (marketplace opening above) |
| 10–25s | Bid + outbid | Brands compete for the next slot |
| 25–40s | QR join | Listeners participate without an app |
| 40–65s | Challenge + answer | Concrete attention condition, not mind-reading |
| 65–85s | Receipt + clearing | 80/20 split on cleared spend |
| 85–100s | Next bid | Repeatable loop |

Keep to **one** challenge and **one** clearing in the marketplace arc.

## The technical explanation, only after the payoff

After the judge has seen answer → proof → reward, use this technical line if asked:

> Stripe moves the money. The proof layer verifies the condition that lets the backend clear the bid and create the listener reward pool.

For the production vision, Midnight is the privacy-preserving proof layer. For the hackathon build, be exact about what is actually running:

> This demo uses our typed JSON verifier to check segment/challenge binding, timing, and replay resistance. The Compact/Midnight implementation is the next replacement behind the same interface.

Never label a JSON-stub receipt **“Verified by Midnight”** or claim the current demo stub is a zero-knowledge proof. Accurate language makes the prototype more credible, not less.

## Make judging criteria visible

Do not merely state that the product is real, usable, technically interesting, or commercially viable. Make each claim visible.

| Judge criterion             | Visible evidence                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Clear problem               | The opening contrast: ignored impressions versus verified attention.                            |
| Understandable product      | The three-step loop stays consistent through every screen.                                      |
| Working prototype           | Bid movement, QR join, challenge response, receipt, threshold, and clearing happen in sequence. |
| Technical credibility       | Explain private data boundaries and the verifier’s exact current capabilities honestly.         |
| Business model              | The cleared bid visibly splits into the listener pool and platform share.                       |
| Scale/story beyond one demo | The next bid and next segment begin immediately after clearing.                                 |

If the screen uses fixture data, label the control or environment **Demo mode**. Scripted is fine; misleading is not. The point is to demonstrate an end-to-end system safely and reliably, not to disguise a rehearsal harness as live production traffic.

## Presentation guardrails

### Say these

- “Verified attention condition” rather than “we prove subjective attention.”
- “Listener rewards funded by verified attention” rather than “revenue share.”
- “The bid clears when the threshold is met” rather than “one person gets paid for one answer.”
- “The audience participates in the marketplace” rather than “we gamify ads.”

### Avoid these

- Leading with “an AI and blockchain advertising platform.”
- Giving a systems diagram before the first bid or listener interaction.
- Explaining every model provider, contract, or WebSocket event during the main demo.
- Claiming the current JSON stub provides cryptographic privacy or production-grade fraud prevention.
- Showing dashboards or configuration panels before the live loop.

## Rehearsal checklist

Before presenting, confirm that every presenter can answer these in one sentence:

1. **What is Slopstream first?** An infinite AI ad stream (The Continuum) that keeps getting weirder — free to watch, fun to leave on.
2. **What problem does the marketplace solve?** Brands pay for impressions that may be ignored; listeners create attention value but do not share in it — until spend clears on proof.
3. **What is the product for phase 1?** Unbroken free Continuum + enjoyable ads; bids come later.
4. **What does the challenge prove?** A listener met a concrete, time-bound condition tied to this segment — not subjective mind-reading.
5. **Why does the proof matter?** It gates whether sponsored spend clears and whether a listener reward pool is created.
6. **What is real today versus next?** State the running generator/verifier truthfully; describe full marketplace and Midnight as the compatible next layer.

The final sentence should match the demo you ran:

- Continuum: "Slopstream turns ads into a living story you do not want to miss the next chapter of."
- Marketplace: "Slopstream turns attention from something platforms extract into something people can prove and share in."
