# Judge Story and Demo Rehearsal

This is the speaking guide for a judge who sees Slopstream with no prior context. The goal is not to explain every subsystem. The goal is for the judge to understand the problem, see the product work, and remember the economic change.

## The one sentence to optimize for

> Slopstream is an ad marketplace where brands pay only after people prove they engaged, and the audience receives a share of the resulting value.

A judge should be able to repeat that sentence after the demo. If a detail does not reinforce it, cut it from the spoken presentation.

## First 10 seconds: audience, pain, payoff

Use this opening before naming any technology:

> Brands spend money on ads that people scroll past. Slopstream is a live attention market: brands bid for verified attention, and when listeners prove they engaged, they earn up to 80% of the cleared spend.

This establishes all three essentials:

| Question in the judge's mind | Answer in the opening                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Who is it for?               | Brands that need real engagement, and listeners whose attention creates value.                                  |
| What hurts today?            | Brands buy impressions without knowing whether anyone engaged; audiences receive none of the value they create. |
| What changes?                | Spend clears only after an attention condition is verified, and the audience participates in the reward pool.   |

Do **not** start with AI, blockchain, Daytona, WebSockets, or zero knowledge. Those are mechanisms; verified attention and shared value are the product.

## The visible product loop

Keep this loop visible on the opening state, a lower-third, or the presenter’s first line:

```text
BRANDS BID → PEOPLE PROVE ATTENTION → VALUE UNLOCKS
```

Every demo moment should prove one part of that loop:

1. The auction proves that brands compete for a slot.
2. QR join plus the challenge proves that listeners participate.
3. The receipt proves a successful attention condition was recorded.
4. Threshold clearing plus the 80/20 animation proves that the economic outcome changes.

## Recommended 100-second demo arc

This is a presentation layer over the detailed [demo script](demo-script.md). The detailed script governs scenes; this guide governs the story a fresh judge hears.

| Time    | Show                                                               | Say                                                                                                                                                      | What it proves                                  |
| ------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0–10s   | Slopstream opening state and the loop                              | “Brands pay for ads people ignore. We let them bid for verified attention instead—and listeners share in the value.”                                     | Problem and payoff.                             |
| 10–25s  | Acme bids, CoolStartup outbids, leaderboard moves                  | “A brand is not buying a vague impression. It is bidding for the next slot in a live market for attention.”                                              | There is a market, not a static ad player.      |
| 25–40s  | QR code, listener joins, reward pool visible                       | “The audience joins without an app. They are not just the product; they are participants in the market.”                                                 | Listener incentive and low-friction entry.      |
| 40–65s  | Memorable ad detail, one multiple-choice challenge, correct answer | “We verify a concrete condition: this listener answered a challenge about this segment in its valid window. We are not claiming to read someone’s mind.” | The attention model is concrete and defensible. |
| 65–85s  | Receipt, threshold fills, cleared-bid split                        | “Once the segment reaches its threshold, the bid clears. Here, $18 becomes $14.40 for the listener reward pool and $3.60 for Slopstream.”                | The proof changes the money flow.               |
| 85–100s | Next bid arrives and next generation begins                        | “Brands bid, people prove attention, and the value flows back to the people who created it. Then the market starts again.”                               | The loop is repeatable and scalable.            |

Keep to **one** challenge and **one** clearing event. A second challenge adds interaction time but does not add understanding.

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

1. **What problem does Slopstream solve?** Brands pay for impressions that may be ignored; listeners create the attention value but do not share in it.
2. **What is the product?** A live auction where brands bid for verified attention and listeners earn from cleared spend.
3. **What does the challenge prove?** A listener met a concrete, time-bound condition tied to this segment—not that their private thoughts were observed.
4. **Why does the proof matter?** It gates whether the bid clears and whether a listener reward pool is created.
5. **Why is there a business?** Slopstream keeps its configurable platform share while brands get a stronger delivery condition.
6. **What is real today versus next?** State the running demo verifier/generator truthfully, then describe Midnight and full provider integration as the compatible next step.

The final sentence of the demo should return to the thesis, not the technology:

> Slopstream turns attention from something platforms extract into something people can prove and share in.
