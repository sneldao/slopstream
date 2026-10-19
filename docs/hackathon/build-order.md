# Hackathon Build Order

Priorities reflect the corrected product direction: **Continuum first, marketplace second.** See [overview](../product/overview.md#phased-rollout).

Wave 3 comeback: [wave3-plan.md](./wave3-plan.md) is now authoritative for
Midnight scope — 3 contracts, Compact-mirroring tests, preprod deploy, `/verify`,
deck + video. P-items below are mapped to it.

## P0 — Must work (phase 1: the stream)

- [x] Live stream _(orchestrator gateway + segment scheduler; overdue auction recovery + demo scraped seed)_
- [x] Continuum media world for the big screen _(central portal, archive cards, theatre mode; see [design language](../product/design-language.md))_
- [ ] **Unbroken free Continuum** — continuous queue, always generating ahead of playback _(partial: prefetch + decoupled generation; target: fully auction-independent scheduling)_
- [ ] **Enjoyable generation** — real ElevenLabs pipeline, format rotation landing, continuity that reads on screen _(stub generator works; quality path is `GENERATOR_MODE=elevenlabs`)_
- [ ] The Continuum story continuity _(summaries + visual archive wired; hero-frame + stronger scripts in progress)_
- [x] Demo-mode harness: fixture-driven full demo sequence with no live backend _(Lane 3)_

## P0 — Must work (marketplace demo — phase 3 rehearsal)

These prove the business model for judges; they do not replace Continuum quality as the day-to-day north star.

- [x] ProofOfAttention contract _(deployed Wave 2; Wave 3 adds verifier-key gate — see [wave3-plan](./wave3-plan.md))_
- [x] Basic listener web client
- [x] One challenge type
- [ ] BidClearing contract _(stub; auction engine in `apps/api`)_
- [x] Brand balance + bid
- [x] Stripe top-up _(mock)_
- [x] Live leaderboard
- [x] Reward pool calculation

## P0 — Wave 3 submission gate (Midnight)

- [ ] `RewardClearing.compact` — `createRewardPool` (owner-gated) + `claimReward` (per-claim nullifier, no double-claim)
- [ ] `PreviewRightsThreshold.compact` — spend commitment + threshold proof, exact spend never disclosed
- [ ] `ProofOfAttention` verifier-key authorization (close "not caller-gated" hole)
- [ ] All 3 compile (Compact 0.31.1 / language 0.23) + deployed to preprod → `contracts/preprod/deployment.json`
- [ ] `contracts/test/*.test.mjs` green on `node:test` + counts in `PROOF.md`
- [ ] `JUDGES.md` + `/verify` + `midnightntwrk` topic + deck + 3-min video + `SUBMISSION.md`

## P1 — Makes the demo excellent

- [x] Multiple challenge types
- [x] OUTBID animation
- [ ] AI-generated video _(ElevenLabs path exists; stub default)_
- [x] Proof receipt
- [x] Listener reward balance
- [x] Scraped startup queue + demo seed _(API seeds on boot; orchestrator scraper optional)_
- [ ] Claim pages and sponsorship UX _(phase 2 outbound)_

## P2 — Stretch

- [ ] Auction-independent segment scheduler _(sponsorship overlay only)_
- [x] RewardClearing on-chain _(Wave 3 scope — was P2, now P0 gate)_
- [x] PreviewRightsThreshold _(Wave 3 scope — was P2, now P0 gate)_
- [ ] Real listener payouts
- [ ] Sophisticated anti-fraud
- [ ] Brand analytics
- [ ] Dynamic auction pricing
- [ ] Reserve / floor price per slot (see [auction strategy](../product/economics.md#sequential-auction-effects))
- [ ] Premium interactive creative (see [plan](../technical/interactive-creative.md))
- [ ] One Daytona generation pipeline _(optional; ElevenLabs direct mode is the near-term quality path)_

## Notes

- **Lead demos with Continuum** in theater mode when the audience should feel the world. Use the full bid → proof → clear loop when explaining the marketplace.
- Listener payouts stay as an internal balance for the hackathon — Wave 2 is real payouts.
- Pre-generate attention challenges from the script/transcript rather than creating them synchronously during playback.
- The 80/20 split matters for the marketplace story; it is not the reason someone watches segment one.

## Progress summary

See [progress.md](./progress.md) for per-lane status. See [wave3-plan.md](./wave3-plan.md) for the Wave 3 comeback execution order.

