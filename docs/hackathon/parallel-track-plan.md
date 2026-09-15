# Parallel Track Plan

## Why Parallel is the right partner track

Slopstream needs a constant supply of fresh, real things to advertise. The Parallel Search API already gives the orchestrator a stream of newly launched companies (Show HN, Product Hunt, YC, startup press). This is the **perception** half of an autonomous media agent:

1. **Perceive** — Parallel finds freshly launched products and their public descriptions.
2. **Decide / Create** — Gemini on Google Cloud writes a short ad script, brand name, and creative angle from that data.
3. **Act** — Slopstream generates the segment, auctions it as a free ad, and airs it in the live stream.
4. **Verify** — listeners complete attention challenges; the Midnight proof-of-attention contract clears the reward pool.

That is a media & entertainment workflow (live, AI-generated ad stream) powered by an agent that uses a partner data source. The judges from Parallel will see their own API as the source of truth that the agent consumes.

## Core pitch for the hackathon

**The Autonomous Producer: an agentic ad network that discovers the internet's newest products and puts them on live TV.**

A producer agent scans Parallel for newly launched companies, uses Gemini to write a 15–20 second ad, and drops it into Slopstream's live attention marketplace. The stream is the big screen; the web app is the studio monitor; the listener phone is the proof-and-reward surface.

## What already fits

- `apps/orchestrator/src/scraper.ts` already calls the Parallel Search API and ingests companies into the API's free-ad queue.
- `apps/generator` already turns a brand/company into an audio segment, a hero image, a transcript, and a challenge.
- `apps/web` already renders the big screen, listener phone, and brand console.
- `apps/api` already has the auction, ledger, and lifecycle event bus.
- The Midnight contracts provide a privacy/proof differentiator.

## Gaps to close for a valid submission

1. **Google Cloud + Gemini runtime usage**
   - Add a real Gemini call in the generator or a new agent step.
   - Use Gemini to write the ad script/title/brand angle from a Parallel-derived company brief.
   - Import and call the Gemini SDK (`@google/generative-ai` or `@google-cloud/vertexai`) so the runtime use is visible in code.

2. **Parallel Search runtime usage**
   - Keep the existing `CompanyScraper` and make it central to the demo.
   - Ensure `src/scraper.ts` imports and calls Parallel Search; no placeholder.
   - Add a web UI view of "incoming discoveries from Parallel" so judges can see the data source.

3. **Agentic workflow that is obvious**
   - Surface the three-step loop in the UI: discover (Parallel) → compose (Gemini) → air (Slopstream).
   - Show one full pass in the 3-minute demo video.

4. **Submission requirements**
   - Add a public `LICENSE` file (MIT recommended).
   - Deploy a hosted version on the VPS (or elsewhere).
   - Record the 3-minute demo video in English.
   - Open-source the repo.
   - Select **Parallel** as the partner track on Devpost.

## Suggested architecture

```text
[Parallel Search API] --companies--> [CompanyScraper] --briefs--> [API free-ad queue]
                                    |
                                    +---> [Gemini] --script/title--> [Generator]
                                                                     |
[Orchestrator] <---auction close----[API] <----segment media--------[Generator]
    |
    +---> [Web] (big screen / listener phone / brand console)
```

- The Parallel scraper is now a first-class data source, not an optional cold-start filler.
- Gemini becomes the creative agent between the scraped company and the generator.
- The orchestrator drives the segment lifecycle as before.

## Minimum viable hackathon scope

1. **Gemini script writer** in `apps/generator` (or `apps/api`) that takes a scraped company and returns an ad script, brand name, and tagline.
2. **Web view** of discovered companies waiting to be produced.
3. **One-button "Produce"** that triggers the full flow: Parallel → Gemini → Generator → Stream.
4. **Demo video** showing the agentic loop end-to-end.
5. **Public repo + license + hosted URL**.

## Build order for the remaining days

| Day | Focus |
| --- | --- |
| 1 | Add `LICENSE`, make repo public, pick Gemini SDK, add one working Gemini call to the generator. |
| 2 | Wire the scraped company brief into the generator; make a free ad end-to-end from Parallel. |
| 3 | Add a "Discoveries" UI to the web app showing incoming Parallel results and produced segments. |
| 4 | Polishing: ensure the orchestrator starts cleanly, pause/resume works, stub mode is demo-ready. |
| 5 | Deploy to the VPS and test the full flow remotely. |
| 6 | Record the 3-minute demo video. |
| 7 | Submit to Devpost (Parallel track). |

## Risk / honest caveat

The Parallel Search scraper is already in the repo but it is not the star of the show. The hackathon submission has to make it *the* star. This means a small pivot in framing, not a rewrite. The bigger risk is the 7-day deadline: if the Parallel API key is not working, the Gemini integration takes longer than expected, or the deployment fails, the submission can slip. Keep the generator in `stub` mode for the demo; only enable ElevenLabs for the final take.

## Decision

**Submit to the Parallel track.** The integration is already present, the agentic story is natural, and it is the only partner track we can ship and host in a week. ClickHouse is a stronger long-term analytics backend, but it is out of scope for this deadline.
