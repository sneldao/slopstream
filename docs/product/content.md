# Content: The Continuum, Challenges, and Cold Start

## Randomized attention challenges

This should become one of Slopstream's signature features. Questions should **not** always appear at the same point.

The challenge engine randomly selects:

- when to interrupt
- question type
- difficulty
- information being tested
- whether a response is required

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

The important thing is that **the challenge itself becomes part of the entertainment**.

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

This builds on the continuity mechanism in the architecture and turns it into an explicit product feature.

**Call this: The Continuum** — the ad stream continuously mutates into increasingly absurd stories.

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

**Legal/consent caveat.** Generating an unsolicited ad for a real company and showing it publicly carries trademark, defamation, and right-of-publicity risk — arguably higher than the revenue-share framing, and it varies by jurisdiction. Before this runs against real companies: keep generated content clearly labelled as unofficial/AI-generated and parody where applicable, honor takedown/opt-out requests immediately, avoid implying endorsement, and check the rules for target jurisdictions. For the prototype, prefer fictional brands or companies that have opted in.
