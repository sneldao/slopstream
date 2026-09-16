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

## 5. Demo video script (62s Buildathon cut — shipped)

Final: 61.9s, 1920x1080 h264+AAC. Same ElevenLabs voice as the product VO
(`eleven_flash_v2_5`, voice `JBFqnCBsd6RMkjVDRZzb`), `bgm.mp3` bed at 0.16.
Video/media binaries are git-ignored under `docs/capture/` — the mp4 ships
via YouTube (unlisted), never in the repo.

| Time | Visual | VO (verbatim) |
|---|---|---|
| 0–5s | Privacy cold-open card: "Prove they watched. Never reveal who." / "Zero-knowledge proof of attention on Midnight" | "Every ad platform tracks who watched. Slopstream proves attention — without ever revealing the person." |
| 5–56s | Product loop (existing 61s VO + footage trimmed `ss=3, t=51`): problem → solution → continuum → brand console → listener → 80/20 | Existing product VO verbatim (see `docs/capture/voiceover-script.md`): "Ads are disposable noise…" through "…they're the marketplace." |
| 56–62s | Integration close card: `ProofOfAttention.compact` circuit excerpt (nullifier / `assert(not in replayWindow)` / threshold) + "Stripe moves the money · Midnight proves the facts" | "A Compact contract on Midnight verifies each listener. Stripe moves the money. Midnight proves the facts." |

Mix notes: VOs are sequential (<open@0.2s> / <product@5.5s> / <close@55.2s>, close
leads the card by 0.8s), never overlapping. Fade in/out boundaries in the
middle come from the source product footage, not the bookends.

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
- [x] Demo/video pitch (script section 5 — 62s cut rendered, uploads to YouTube unlisted)
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
