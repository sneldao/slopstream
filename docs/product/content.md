# Content: The Continuum

## North star

Slopstream is not "an auction that sometimes plays ads." It is **an infinite AI ad universe** that should be:

- **Free** — the stream runs on Continuum filler (fictional brands, scraped startups, running arcs) without waiting for bids
- **Immersive** — archive memory, visual continuity, and a world that accumulates on screen
- **Fun** — format rotation, absurd story escalation, ads people actually want to hear

The attention marketplace and brand bids are **phase two and three** (see [overview](overview.md#phased-rollout)). Engineering may still schedule segments through auctions today; product and creative investment should treat the free Continuum as the main event.

## The infinite ad: The Continuum

This is Slopstream's strongest differentiator. The stream should not feel like:

> Ad → Ad → Ad → Ad.

Instead: **one continuously evolving AI-generated universe.**

Each generated segment receives a summary of recent segments. For example:

```text
SEGMENT 1

Acme AI introduces an AI robot.

↓

SEGMENT 2

The robot escapes Acme's laboratory.

↓

SEGMENT 3

The robot gets hired by another startup.

↓

SEGMENT 4

The startup puts the robot on Shark Tank.

↓

SEGMENT 5

The robot becomes a billionaire.

↓

SEGMENT 6

Acme AI tries to buy it back.
```

### Continuity layers (priority order)

1. **Story continuity** — the orchestrator passes recent summaries into the next generation request so the next segment can continue the premise.
2. **Visual continuity** — the public stream snapshot retains the eight newest completed segments. The screen renders them as archive fragments with a deterministic composition recipe, so refresh and reconnect preserve the world already built.
3. **Hero-frame continuity** — for `video` and `premium` tiers the generator produces a still image first, stores its URL in `visualMetadata.heroImageUrl`, and passes it forward as `continuityImageUrl` on the next request so motion ads can echo the prior segment's palette and composition.
4. **Format continuity** — eight creative formats rotate deterministically so consecutive beats differ in voice and tone (see below).
5. **Market continuity** *(phase 2+)* — optional `GenerationMarketContext` when sponsorship is live: scripts may react to bid pressure or a segment that just cleared its threshold. Not required for phase 1; story beats matter more than market stings.

When nothing is playing and no segment is generating, the Continuum enters an **idle** state: archive cards drift more slowly so the world still feels alive between slots. Idle should be quiet — a breath, not a billboard for placeholder copy.

**Call this: The Continuum** — the ad stream continuously mutates into increasingly absurd stories.

### Creative format rotation

No two consecutive ads should sound the same. The generator deterministically assigns each segment one of eight creative formats (FNV-1a hash of the segment ID, so replays are stable):

| Format              | Tone          | Voice       | Visual style                  |
| ------------------- | ------------- | ----------- | ----------------------------- |
| Comedy Monologue    | comedy        | Domi        | playful, absurd               |
| Cinematic Anthem    | anthem        | Antoni      | epic, hero shot               |
| Late Night Radio    | radio         | Josh        | nocturnal, neon               |
| Infomercial Parody  | infomercial   | Arnold      | 90s TV ad                     |
| Soft Launch         | intimate      | Elli        | minimal, elegant              |
| Hype Drop           | hype          | Bella       | graffiti-meets-tech           |
| Documentary Voice   | documentary   | George      | nature-doc-meets-tech         |
| News Bulletin       | news          | Rachel      | clean, editorial              |

Each format has its own script template (hook → body → CTA structure varies by tone), a distinct ElevenLabs voice, and a visual style hint that feeds the image/video prompt. The format name and tone are included in `audioMetadata` so the UI can display them, and the tone prefix is carried into the continuity summary so the next segment knows what style came before.

### Phase 1 success metrics

Optimize for watchability before monetization:

| Metric | Why it matters |
| --- | --- |
| Stream uptime (no dead air) | If the pipeline stalls, nothing else matters |
| Segments per session watched | Are people staying for the next beat? |
| Continuity coherence | Does the story feel like one world? |
| Format variety | Does it stay surprising? |
| Shareability | Would someone send a clip to a friend? |

Bid volume and leaderboard churn are **lagging indicators** until the baseline is excellent.

## Free AI-generated ads (the primary stream)

Slopstream must have great ads **even when nobody is paying**. This is not a "cold-start engine" or empty-state filler — it **is** the product in phase 1.

1. Seed and scrape companies (Hacker News, Product Hunt, YC launches, fictional demo brands).
2. Generate free Continuum segments continuously — always keep the generation queue ahead of playback.
3. Play them in an evolving story with archive memory on the big screen.

The outbound sales motion comes **after** quality:

```text
ACME AI

We've already generated
an advertisement for you.

👀 1,284 listeners saw it.

Want to take control?

[ CLAIM ACME ]
```

Once claimed:

> "Want the next beat in the story?"

→ brand console / sponsorship (phase 2) → full auction marketplace (phase 3).

**Legal/consent caveat.** Generating unsolicited ads for real companies carries trademark, defamation, and right-of-publicity risk. See [risks.md](risks.md#unsolicited-ai-generated-ads-cold-start-engine) — for the prototype, prefer fictional brands or opt-in companies.

## Randomized attention challenges

This can become one of Slopstream's signature features, but it must remain an **invitation** rather than an interruption. Challenges are shown only to listeners who explicitly enable **Earn Mode**; everyone else can simply watch and hear the stream.

The challenge engine randomly selects, for eligible Earn Mode listeners:

- when an opportunity opens
- question type
- difficulty
- information being tested

Possible challenge types:

### Recall

> What product did the company mention?

### Audio

> Which sound did you just hear?

### Visual

> What appeared in the previous frame?

### Completion

> "Acme makes ______ for developers."

### True / False

> Acme said its product works offline.

### Sequence

> What happened immediately before the robot appeared?

### Voice

> Repeat: "Acme makes developers faster."

### Image

> Show three images: which one appeared in the ad?

The important thing is that earning feels playful without turning the broadcast into a questionnaire. A correct response produces a private proof receipt and an estimated reward; it does not stop or alter the public segment.

Technical details of the challenge engine live in [backend](../technical/backend.md#attention-challenge-engine).
