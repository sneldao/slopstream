# Content: The Continuum, Challenges, and Cold Start

## Randomized attention challenges

This can become one of Slopstream's signature features, but it must remain an
invitation rather than an interruption. Challenges are shown only to listeners
who explicitly enable **Earn Mode**; everyone else can simply watch and hear
the stream.

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

The important thing is that earning feels playful without turning the broadcast
into a questionnaire. A correct response produces a private proof receipt and
an estimated reward; it does not stop or alter the public segment.

Technical details of the challenge engine live in [backend](../technical/backend.md#attention-challenge-engine).

## The infinite ad: The Continuum

This is one of Slopstream's strongest differentiators. The stream should not feel like:

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

This has two complementary continuity layers:

- **Story continuity:** the orchestrator passes recent summaries into the next
  generation request so the next segment can continue the premise.
- **Visual continuity:** the public stream snapshot retains the eight newest
  completed segments. The screen renders them as archive fragments with a
  deterministic composition recipe, so refresh and reconnect preserve the
  world already built.

This builds on the continuity mechanism in the architecture and turns it into
an explicit product feature.

**Call this: The Continuum** — the ad stream continuously mutates into increasingly absurd stories.

### Creative format rotation

No two consecutive ads should sound the same. The generator deterministically
assigns each segment one of eight creative formats (FNV-1a hash of the segment
ID, so replays are stable):

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

Each format has its own script template (hook → body → CTA structure varies
by tone), a distinct ElevenLabs voice, and a visual style hint that feeds the
image/video prompt. The format name and tone are included in
`audioMetadata` so the UI can display them, and the tone prefix is carried
into the Continuity summary so the next segment knows what style came before.

## Free AI-generated ads (cold-start engine)

Slopstream should have ads **even when nobody is paying**.

1. Continuously scrape newly launched companies from sources such as: Hacker News, Product Hunt, YC launches, startup/news feeds.
2. Generate a free AI ad.
3. Put it into the stream.

Then the company eventually discovers:

> "Holy shit. Slopstream just made an ad for us."

Give every company a **claim page**:

```text
ACME AI

We've already generated
an advertisement for you.

👀 1,284 listeners saw it.

Want to take control?

[ CLAIM ACME ]
```

Once claimed:

> "Want the next slot?"

→ bidding console.

This turns the free tier into an **automated outbound sales engine**.

**Legal/consent caveat.** Generating unsolicited ads for real companies carries trademark, defamation, and right-of-publicity risk. See [risks.md](risks.md#unsolicited-ai-generated-ads-cold-start-engine) — for the prototype, prefer fictional brands or opt-in companies.
