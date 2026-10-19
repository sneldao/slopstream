// PreviewRightsThreshold circuit mirror — node:test, zero installs.
// Mirrors contracts/src/PreviewRightsThreshold.compact: owner-gated threshold
// + spend attestation, qualification proven without revealing the amount.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const pubkey = (sk, seq) => sha256(`slopstream:pk:|${seq}|${sk}`);
const spendCommit = (cents) => sha256(`slopstream:spend:|${cents}`);

function makeLedger({ ownerSk = "owner-sk", threshold = 10000 } = {}) {
  return { spendThreshold: threshold, qualified: false,
    spendCommitment: "slopstream:prt:zero",
    owner: pubkey(ownerSk, "1"), sequence: 1, ownerSk };
}
function setSpendThreshold(l, { sk, threshold }) {
  assert.equal(l.owner, pubkey(sk, String(l.sequence)), "Not the contract owner");
  l.spendThreshold = threshold; l.sequence += 1;
}
function recordSpend(l, { sk, cents }) {
  assert.equal(l.owner, pubkey(sk, String(l.sequence)), "Not the contract owner");
  l.spendCommitment = spendCommit(cents);
  if (cents >= l.spendThreshold) l.qualified = true;
  l.sequence += 1;
}
function proveQualification(l, { actualCents }) {
  assert.ok(actualCents >= l.spendThreshold, "Spend below threshold");
  assert.equal(l.spendCommitment, spendCommit(actualCents), "Spend commitment mismatch");
  l.qualified = true;
  return true;
}

describe("PreviewRightsThreshold", () => {
  it("recordSpend below threshold does not qualify", () => {
    const l = makeLedger({ threshold: 10000 });
    recordSpend(l, { sk: "owner-sk", cents: 5000 });
    assert.equal(l.qualified, false);
    assert.equal(l.spendCommitment, spendCommit(5000));
  });
  it("recordSpend at/above threshold qualifies without revealing amount publicly", () => {
    const l = makeLedger({ threshold: 10000 });
    recordSpend(l, { sk: "owner-sk", cents: 15000 });
    assert.equal(l.qualified, true);
    assert.notEqual(l.spendCommitment, "15000"); // only a commitment is public
  });
  it("proveQualification succeeds when commitment matches and spend >= threshold", () => {
    const l = makeLedger({ threshold: 10000 });
    recordSpend(l, { sk: "owner-sk", cents: 12000 });
    l.qualified = false; // reset to prove the circuit path independently
    assert.equal(proveQualification(l, { actualCents: 12000 }), true);
    assert.equal(l.qualified, true);
  });
  it("proveQualification fails below threshold", () => {
    const l = makeLedger({ threshold: 10000 });
    recordSpend(l, { sk: "owner-sk", cents: 9000 });
    assert.throws(() => proveQualification(l, { actualCents: 9000 }), /Spend below threshold/);
  });
  it("proveQualification fails on commitment mismatch (lying about spend)", () => {
    const l = makeLedger({ threshold: 10000 });
    recordSpend(l, { sk: "owner-sk", cents: 12000 });
    assert.throws(() => proveQualification(l, { actualCents: 99999 }), /Spend commitment mismatch/);
  });
  it("non-owner cannot change threshold or record spend", () => {
    const l = makeLedger();
    assert.throws(() => setSpendThreshold(l, { sk: "mallory", threshold: 1 }), /Not the contract owner/);
    assert.throws(() => recordSpend(l, { sk: "mallory", cents: 1 }), /Not the contract owner/);
  });
});
