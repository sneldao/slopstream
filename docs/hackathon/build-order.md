# Hackathon Build Order

## P0 — Must work

- [ ] ProofOfAttention contract _(stub verifier implemented; Compact contract not yet)_
- [x] Basic listener web client
- [x] One challenge type
- [ ] BidClearing contract _(stub; auction engine implemented in `apps/api`)_
- [x] Brand balance + bid
- [x] Stripe top-up _(mock — instant credit, no real Stripe)_
- [ ] One Daytona generation pipeline _(provider/job seams + stub generator implemented; Daytona/model providers pending)_
- [x] Live stream _(orchestrator gateway + segment scheduler implemented and verified end-to-end against all five services)_
- [x] Live leaderboard
- [x] Reward pool calculation
- [x] Demo-mode harness: fixture-driven full demo sequence with no live backend, generator, or contracts (Lane 3 owns the player; Lanes 1–2 supply canned proof/clearing data)

## P1 — Makes the demo excellent

- [x] Multiple challenge types _(recall, true_false, sequence in `apps/api/src/challenges.ts`)_
- [x] OUTBID animation _(2D version done; 3D physics version in [3D overhaul plan](./3d-overhaul-plan.md))_
- [ ] AI-generated video _(stub generator only)_
- [x] Proof receipt
- [x] Listener reward balance
- [ ] The Continuum continuity _(partially wired: the orchestrator passes the previous segments' summaries as `GenerationRequest.previousSummaries`; the stub generator echoes them into the next transcript)_
- [ ] Scraped startup cold start _(cross-lane: Lane 1 writes the scraper and generates the free ads → Lane 2 backend ingests companies and serves claim pages → Lane 3 inserts segments into the stream; agree on the scraped-company payload shape in `packages/shared` before any lane starts)_
- [ ] 3D fluid world for the big screen _(see [3D overhaul plan](./3d-overhaul-plan.md) — R3F + metaball shader + Rapier physics)_

## P2 — Stretch

- [ ] RewardClearing fully on-chain
- [ ] PreviewRightsThreshold
- [ ] Real listener payouts
- [ ] Sophisticated anti-fraud
- [ ] Brand analytics
- [ ] Dynamic auction pricing
- [ ] Reserve / floor price per slot (prevents stream deflation — see [auction strategy](../product/economics.md#sequential-auction-effects))

## Notes

- Listener payouts stay as an internal balance for the hackathon — the payout rail is Wave 2. The demo only needs to prove that verified attention creates an attributable reward. Don't turn the hackathon into a payments/KYC project.
- Pre-generate attention challenges from the script/transcript rather than creating them synchronously during playback.
- Keep the 80/20 split front and center: it gives the judges an immediate reason to care about the attention proof.

## Progress summary

See [progress.md](./progress.md) for a detailed per-lane status of what's implemented, what's stubbed, and what remains.
