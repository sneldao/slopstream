// ProofOfAttention circuit mirror — runs on node:test with zero installs.
// Mirrors contracts/src/ProofOfAttention.compact byte-for-byte semantics:
// same 4-deep nullifier window, same revert strings, same threshold flip.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const nullifier = (secret, seg, chal) => sha256(`${secret}|${seg}|${chal}`);
const pubkey = (sk, seq) => sha256(`slopstream:pk:|${seq}|${sk}`);

// Minimal in-memory model of the ledger.
function makeLedger({ threshold = 3, ownerSk = "owner-sk", seq = 1 } = {}) {
  return {
    verifiedCount: 0,
    window: ["slopstream:v1:prev3", "slopstream:v1:prev2", "slopstream:v1:prev1", "slopstream:v1:zero"],
    attentionThreshold: threshold,
    thresholdMet: false,
    owner: pubkey(ownerSk, String(seq)),
    sequence: seq,
    ownerSk,
  };
}

function submitAttentionProof(ledger, { sk, secret, segmentId, challengeId }) {
  // Wave 3 verifier-key gate.
  assert.equal(ledger.owner, pubkey(sk, String(ledger.sequence)), "Not the verifier");
  const n = nullifier(secret, segmentId, challengeId);
  for (const w of ledger.window) assert.notEqual(n, w, "Replayed attention proof rejected");
  ledger.window = [ledger.window[1], ledger.window[2], ledger.window[3], n];
  ledger.verifiedCount += 1;
  if (!ledger.thresholdMet && ledger.verifiedCount >= ledger.attentionThreshold) ledger.thresholdMet = true;
  return n;
}

describe("ProofOfAttention", () => {
  it("accepts a fresh proof and increments the count", () => {
    const l = makeLedger();
    const n = submitAttentionProof(l, { sk: "owner-sk", secret: "s1", segmentId: "seg1", challengeId: "ch1" });
    assert.equal(l.verifiedCount, 1);
    assert.equal(l.window[3], n);
    assert.equal(l.thresholdMet, false);
  });
  it("rejects a replayed proof within the window", () => {
    const l = makeLedger();
    submitAttentionProof(l, { sk: "owner-sk", secret: "s1", segmentId: "seg1", challengeId: "ch1" });
    assert.throws(() => submitAttentionProof(l, { sk: "owner-sk", secret: "s1", segmentId: "seg1", challengeId: "ch1" }), /Replayed attention proof rejected/);
  });
  it("rejects a replay even when other proofs landed in between", () => {
    const l = makeLedger();
    submitAttentionProof(l, { sk: "owner-sk", secret: "s1", segmentId: "seg1", challengeId: "ch1" });
    submitAttentionProof(l, { sk: "owner-sk", secret: "s2", segmentId: "seg1", challengeId: "ch2" });
    submitAttentionProof(l, { sk: "owner-sk", secret: "s3", segmentId: "seg1", challengeId: "ch3" });
    assert.throws(() => submitAttentionProof(l, { sk: "owner-sk", secret: "s1", segmentId: "seg1", challengeId: "ch1" }), /Replayed attention proof rejected/);
  });
  it("shifts the 4-deep window and drops the oldest", () => {
    const l = makeLedger();
    const ns = [1, 2, 3, 4, 5].map((i) => submitAttentionProof(l, { sk: "owner-sk", secret: `s${i}`, segmentId: "seg", challengeId: `ch${i}` }));
    assert.deepEqual(l.window, ns.slice(1));
  });
  it("flips thresholdMet when verifiedCount reaches attentionThreshold", () => {
    const l = makeLedger({ threshold: 3 });
    submitAttentionProof(l, { sk: "owner-sk", secret: "a", segmentId: "s", challengeId: "c1" });
    submitAttentionProof(l, { sk: "owner-sk", secret: "b", segmentId: "s", challengeId: "c2" });
    assert.equal(l.thresholdMet, false);
    submitAttentionProof(l, { sk: "owner-sk", secret: "c", segmentId: "s", challengeId: "c3" });
    assert.equal(l.thresholdMet, true);
  });
  it("rejects submissions without the verifier key", () => {
    const l = makeLedger();
    assert.throws(() => submitAttentionProof(l, { sk: "attacker", secret: "s1", segmentId: "seg1", challengeId: "ch1" }), /Not the verifier/);
  });
});
