# Hackathon Build Order

## P0 — Must work

- [ ] ProofOfAttention contract
- [ ] Basic listener web client
- [ ] One challenge type
- [ ] BidClearing contract
- [ ] Brand balance + bid
- [ ] Stripe top-up
- [ ] One Daytona generation pipeline
- [ ] Live stream
- [ ] Live leaderboard
- [ ] Reward pool calculation

## P1 — Makes the demo excellent

- [ ] Multiple challenge types
- [ ] OUTBID animation
- [ ] AI-generated video
- [ ] Proof receipt
- [ ] Listener reward balance
- [ ] Infinite Slop continuity
- [ ] Scraped startup cold start (cross-lane: scraper ingestion in Lane 2 backend → generation + stream insertion in Lane 3; agree on the scraped-company payload shape in `packages/shared` before either lane starts)

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
