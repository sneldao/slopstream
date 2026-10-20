# Entry pack — hackathons and programmes outside Midnight

Researched 2026-10-20. Scope: what a team could still join before 2027-02-28,
with the eligibility evidence that decides it. The pattern is the finding:
**every door worth walking through accepts work that already exists; every
build-gated door wants a re-platform we cannot afford mid-deploy.**

Prizes are indicative and move — re-verify on the official page the day you
submit. Links, not paraphrase, are the source of record.

## Order of operations

| #   | Door                                                                            | Deadline                                       | What it costs us                  | Blocked on                                 |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------ |
| 1   | [Cloudflare for Startups](https://www.cloudflare.com/startups/)                 | rolling                                        | application only                  | **a registered company** (see below)       |
| 2   | [ElevenLabs Startup Grants](https://elevenlabs.io/startup-grants)               | rolling                                        | application only                  | **a registered company** + business email  |
| 3   | [HackerNoon Decentralize AI](https://decentralizeai.tech/) round 2              | **27 Feb 2027**                                | one tagged article                | a demo URL that connects                   |
| 4   | [Midnight Request for Startups](https://midnight.network/request-for-start-ups) | rolling                                        | 1-page answer                     | nothing — write it now                     |
| 5   | [Midnight Build Club](https://midnight.network/build-club)                      | cohort application, apply now                  | 8 weeks, mentorship               | willingness to be schedule-bound           |
| 6   | [Colosseum Eternal](https://colosseum.com/eternal)                              | window Nov 2026–Mar 2027, **currently paused** | submission + past-work disclosure | the window opening                         |
| 7   | [Cloudflare Project Alexandria](https://www.cloudflare.com/lp/project-alexandria/) | rolling                                     | application only                  | an open source case — repo is Apache-2.0   |

### Eligibility is corporate, not geographic

Corrected 2026-10-20: we are UK-based with **no registered entity**, and that —
not the country — is what closes doors 1 and 2. Both programmes run globally;
Cloudflare's own criteria are corporate ("your company was incorporated no more
than 10 years ago"), and ElevenLabs is "startups and small companies only",
under 25 employees, with a business email to match. Two individuals with a
GitHub repo are not a company to either reviewer, and pretending otherwise
wastes an application slot.

What that leaves:

- **Doors 3–6 are unaffected.** HackerNoon, Midnight RFS, Build Club and
  Colosseum Eternal all accept individuals; prize money pays a person. The
  credits plan is what moved, not the competition plan.
- **Door 7 is the project-shaped substitute.** Project Alexandria is Cloudflare's
  *open source* credits programme and keys on the project rather than the
  payroll, which is the only reason it is on this list at all. Re-read its
  criteria before applying — this entry came off the programme summary page and
  nobody has read the terms since (WebFetch was rate-limited during this
  correction).
- **The unlock is ~£50 and a day, not a relocation.** Registering an England &
  Wales company at Companies House gets doors 1 and 2 back. It also gets
  Corporation Tax, annual accounts and a confirmation statement, so it is a
  decision about whether we intend to *operate* something, not a form to file
  for credits. Nothing here should be written to a reviewer that implies an
  entity exists before one does.
- **Nothing is actually starved.** The loop is $0/day precisely because
  evergreen rotation calls no provider, so the ElevenLabs grant was upside, not
  a dependency, and R2 already runs on its free allowance. The honest cost of
  incorporation is optionality, not survival.

3, 4, 6 and 7 cost no engineering. Run them in parallel with the deploy, not
after it.
Skip: ETHGlobal Mumbai (in-person; prior work is barred from partner prizes and
the Finalist category), lablab Vultr Agent Rush (closes 8 Nov and requires
*every* LLM call to route through Vultr Serverless Inference — that is a
generator rewrite, and its "original and MIT-compliant" wording clashes with
our Apache-2.0 repo; ask before assuming), Encode Solana (settlement rewrite,
non-cash prizes), Cardano Catalyst (Fund15/16 did not proceed; Pilot 2026
already selected 12 teams on 24 Sep), Google Agents for Impact (social-impact
brief, wrong shape for an ad market), NLnet (funds EU open source and
explicitly does not want AI-generated projects).

## What we are, in one paragraph (reuse verbatim)

Slopstream is a live, continuously-running AI-generated ad stream with
verifiable attention. A creative is written, voiced and rendered by models,
auctioned to brands in real time, and aired on rotation forever. Viewers answer
challenges and receive a nullifier-backed proof that a slot met its verified-
attention threshold — without revealing who watched, what they answered, or
building a profiling database. Settlement is 80/20 in ledger points, not cash:
the chain records facts, not payments. Ad fraud and GDPR-style profiling are
the problem; the infinite weird stream is only the demo surface. Stack:
Next.js 15 + React 19 across three surfaces, Node orchestrator/API/verifier/
generator, PostgreSQL + Redis, Cloudflare R2 for media, three Compact contracts
(ProofOfAttention, RewardClearing, PreviewRightsThreshold, 10 exported circuits)
on Midnight preprod via Blockfrost. 365 workspace tests, Apache-2.0.

## Per-door notes

### Cloudflare for Startups

$10k of credits, one year, no equity. Gate: an **incorporated** company,
bootstrapped or self-funded under $1M raised, founded under 10 years, **a live
public site**, card on file. The first clause is the one that stops us today.
R2 is already our asset layer and `apps/asset-uploader` is already a Worker, so
the "what do you use it for" answer is true rather than planned — say R2 +
Workers + cacheable content-addressed media, and that the stream is $0/day
because evergreen rotation never calls a provider.

### ElevenLabs Startup Grants

~33M characters over 12 months (roughly $5.5k of TTS). Gate: a startup or
company under 25 employees, **no short-term or one-off projects**, business
email. Also corporate. That second clause is the interesting part of the
application once an entity exists: lead with the evergreen loop and the fact
that voice is the product's narration layer, not a demo gimmick, and with the
spend guards (`ELEVENLABS_MAX_TIER` plus a per-process call budget reported on
`/health`) that show we treat their bill as our problem.

### Cloudflare Project Alexandria

Their open source credits programme: the pitch is the project, not a
certificate of incorporation, and slopstream is Apache-2.0 with a public repo,
365 tests and real infrastructure on their stack. Worth one application
*because* the two corporate doors are shut — but its terms were read off a
summary page, so confirm what "open source project" has to mean (licence,
activity, governance) before writing to them.

### HackerNoon Decentralize AI

Existing projects are explicitly welcome ("alongside new ones"), but mockups
and coming-soon projects are not eligible — so this one needs a URL that
actually plays. $51,750+ pool, half per round, weighted to Nosana compute
credits rather than cash. Entry is a tagged article, so the real work is the
post, not a build. Angle that fits their theme: *decentralised verification of
an AI-generated economy* — the stream is synthetic, the attention proof is not.

### Midnight Request for Startups + Build Club

Their own category language is our pitch: **PET** and **AI & Agentic**
("autonomous economic agents… machine-to-machine commerce"). Build Club is
eight weeks, technology-agnostic, does not mandate exclusive deployment, and
routes toward a pre-seed check and the Night Sky accelerator. These are the
highest-fit doors precisely because they are not a hackathon.

### Colosseum Eternal

"Builders may use pre-existing code" with disclosure of past development on the
submission form, and "chain choice does not affect Eternal Award eligibility" —
so a Midnight project is admissible. $25k USDC semi-annual award plus
consideration for a $250k pre-seed. The only hard bar is having raised
venture capital. Currently paused ("New sprints are closed"); watch for the
window to open.

## Claims that must not leave the repo

Whatever the venue, these hold the line or the submission is dishonest:

- **Contracts are compiled, not deployed.** `contracts/preprod/deployment.json`
  still reads `TBD-wave3-deploy` for all three until `deploy:all` lands. Never
  write "on-chain live" before a real address exists.
- The backend ledger is authoritative for clearing; on-chain records are
  corroborating evidence and non-repudiation.
- Rewards are **points, not money**. No sentence that implies a payout.
- `BidClearing.compact` is a sketch; the auction engine is in `apps/api`.
- Not audited. Preprod, not mainnet. Demo brand tokens are demo-only.

## The provenance question, answered once

Two programmes in this space disqualify or discount work "generated entirely by
AI without meaningful human contribution" (Midnight's contributor bounties, and
NLnet in stronger words). Any judge will also ask the plain version: *what did
you do?* Answer it in the same terms everywhere — a human chose the privacy
thesis, defined the circuit boundaries and the 80/20 invariant, set the
deployment gates, wrote the acceptance criteria, and rejected designs; an agent
wrote most of the code against them and the 365 tests are how either of us can
tell that happened correctly. That is true, it is the interesting part of this
project, and it does not need to be softened.

## What the public URL actually exposes

`apps/web/vercel.json` bakes `https://slopstream.144.202.117.160.sslip.io` into
the build. The IP is not the sensitive part — an `sslip.io` hostname resolves to
it publicly anyway, so publishing it in a repo adds nothing an observer cannot
get with `dig`. The exposure that matters is what listens on that address:
confirm the Coolify dashboard is not reachable unauthenticated (its own port,
often 8443, and often left open on a fresh install), and that SSH is key-only
and not the deployer's only gate. Prefer a real domain on the submission forms
regardless — both startups programmes read the domain as a signal.

## Decision (2026-10-20, amended same day)

Goal is still **credits and visibility, not cash** — but the route changed once
the eligibility basis was corrected. We are UK-based individuals with no
registered company, so the two credit programmes are out for now and the
assumption that "not USA" was the reason was wrong; the blocker is corporate
form, and it is fixable for the price of a Companies House fee if we ever
decide to operate rather than experiment.

So, today:

1. **Write the Midnight RFS answer and apply to Build Club** — the highest-fit
   doors, and neither cares about an entity.
2. **Publish the HackerNoon round-2 post** once a freshly-built web bundle
   actually connects (an existing-project venue needs a URL that plays, not one
   on `No signal`).
3. **One Project Alexandria application** as the entity-free substitute for the
   Cloudflare credits, terms confirmed first.
4. **Hold Colosseum Eternal on watch** for the November window — cash plus
   investor exposure, and open to individuals.
5. **Do not submit doors 1 and 2** as individuals. Revisit them the day an
   entity exists, and treat forming one as a business decision on its own
   merits.

No build-gated entry before the Midnight wave closes. The provider-spend case
does not depend on any of this: the loop is $0/day because rotation calls no
model, and R2 lives inside its free allowance.
