# Slopstream — Wave 1 Submission Pack (Midnight Buildathon)

> Copy-paste-ready for the AKINDO form.
> Repo: <https://github.com/sneldao/slopstream> · topic `midnightntwrk`
> License: Apache-2.0.

---

## 1. Wave 1 progress description ("progress completed during this Wave")

Wave 1 built the Midnight trust core from interface sketches to a compiling,
wired, judge-verifiable integration:

- **ProofOfAttention.compact (102 lines, Compact 0.23):** nullifier circuit
  (persistentHash of ephemeral listener secret + segment + challenge IDs),
  4-deep replay window, public verifiedCount + thresholdMet, owner-gated
  setAttentionThreshold. Compiled with compactc 0.31.1 (preprod runtime
  0.16.0); bindings, prover/verifier keys, ZK IR checked in.
- **Midnight SDK stack:** wallet builder, ZK witnesses, ProofOfAttentionApi
  (deploy / join / submit / read-ledger), plus deploy, state, submit-proof
  scripts against preprod.
- **Midnight-path verifier:** VERIFIER_MODE=midnight runs the same structural
  checks as stub, then records accepted proofs on-chain; receipts return
  verifierMode midnight with a midnight_<nullifier> proof ID.
- **Submission gates:** Apache-2.0 LICENSE, midnightntwrk topic, README
  judge-evaluation guide, SKIP_FUNDS_REQUEST fix for the legacy faucet path.
- **Honest status:** preprod deploy attempted; wallet sync stalled before
  funds became visible. Contract compiles, SDK wired, deploy reproducible —
  **live preprod deployment is the Wave 2 milestone.**

---

## 2. Privacy design ("how privacy shapes the product")

Brands buy verified human attention, but neither listener identity nor answers
may ever touch a public ledger. The listener secret is an ephemeral
per-listener-per-segment witness held only in the verifier's private state,
rotated every submission. Segment/challenge binding is proven in-circuit,
never disclosed. Only three facts go public: the replay-protecting nullifier,
the aggregate verified count, and the threshold flag. That is Midnight's
dual-ledger model doing exactly what it is for: prove the fact, hide the
person.

---

## 3. Architecture (form field / slide 6)

LISTENER answers challenge (private: identity, answer, session)
-> API grades privately -> VERIFIER (stub | midnight)
-> MIDNIGHT PREPROD ProofOfAttention (public: nullifier, count, threshold)
-> API clears bid -> 80/20 listener reward pool.

Stripe moves dollars; Midnight proves facts — contracts never custody funds.

Key files: contracts/src/ProofOfAttention.compact,
packages/midnight/src/{api,wallet,witnesses}.ts,
packages/midnight/scripts/{deploy,state,submit-proof}.ts,

---

## 5. Demo video script (3 min)

Existing 61s VO (docs/capture/voiceover-script.md) covers the product loop.
For the Buildathon cut, prepend a 30s privacy cold-open and append a 30s
integration close:

COLD OPEN (new, screen: contract source): "Every ad platform has the same
dirty secret: to prove someone watched, it tracks who they are. Slopstream
proves attention without ever revealing the person. A zero-knowledge contract
on Midnight verifies the condition — and the listener stays private."

PRODUCT LOOP (reuse existing 61s VO + footage as-is).

INTEGRATION CLOSE (new, screen: terminal): "Under the hood: a Compact
contract called ProofOfAttention. Each verified listener becomes an on-chain
nullifier — replay-proof, unlinkable, counted toward a public threshold. When
the threshold flips, the bid clears and eighty percent flows to the audience.
Stripe moves the money. Midnight proves the facts."

Honesty guardrail: never label a JSON-stub receipt "Verified by Midnight."
Say "verification result" for stub footage; "on-chain proof" only for real
preprod receipts (Wave 2).

---

## 6. Submission checklist

- [x] Public repo with midnightntwrk topic
- [x] Apache-2.0 LICENSE (contracts, packages/midnight, apps/verifier)
- [x] Compiling Compact contract (0.31.1 / language 0.23 / runtime 0.16.0)
- [x] README judge-evaluation guide
- [x] Wave 1 progress description (section 1 above)
- [ ] Slide deck (outline section 4 — needs design)
- [ ] Demo/video pitch (script section 5 — needs recording)
- [ ] AKINDO form submit + team registrations + Discord

apps/verifier/src/{server,midnightVerifier}.ts.

---

## 4. Slide deck outline (10 slides)

1. Title — live marketplace for human attention on Midnight.
2. Problem — brands pay for impressions; audience gets nothing.
3. Solution — pay for verified attention; audience shares up to 80%.
4. Live loop — bid, generate, prove, unlock. (Screenshots.)
5. Privacy design — private vs public data diagram.
6. Contract — 102 lines, nullifier circuit, replay window, threshold.
7. End-to-end proof — challenge, receipt, threshold, clearing, 80/20.
8. Wave 1 status — compiled, wired, deploy attempted (Wave 2 milestone).
9. Roadmap — Wave 2: live deploy. Wave 3: more circuits, durable ledger.
10. Team + ask — repo + demo links, feedback wanted.
