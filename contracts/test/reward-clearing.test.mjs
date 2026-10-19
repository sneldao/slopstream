// RewardClearing circuit mirror — node:test, zero installs.
// Mirrors contracts/src/RewardClearing.compact: owner-gated pool creation,
// per-claim nullifier window, same revert strings.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const pubkey = (sk, seq) => sha256(`slopstream:pk:|${seq}|${sk}`);
const claimNull = (secret, bid) => sha256(`${secret}|${bid}|slopstream:rc:claim`);

function makeLedger({ ownerSk = "owner-sk" } = {}) {
  return { eligibleAmount: 0, bidId: "slopstream:rc:zero", poolOpen: false,
    window: ["slopstream:rc:prev3", "slopstream:rc:prev2", "slopstream:rc:prev1", "slopstream:rc:zero"],
    owner: pubkey(ownerSk, "1"), sequence: 1, ownerSk };
}
function createRewardPool(l, { sk, bidId, amount }) {
  assert.equal(l.owner, pubkey(sk, String(l.sequence)), "Not the contract owner");
  l.bidId = bidId; l.eligibleAmount = amount; l.poolOpen = true; l.sequence += 1;
}
function claimReward(l, { secret, bidId, amount }) {
  assert.equal(l.poolOpen, true, "Reward pool is not open");
  assert.equal(bidId, l.bidId, "Claim is for a different pool");
  assert.ok(amount <= l.eligibleAmount, "Claim exceeds pool");
  const n = claimNull(secret, bidId);
  for (const w of l.window) assert.notEqual(n, w, "Replayed reward claim rejected");
  l.window = [l.window[1], l.window[2], l.window[3], n];
  return n;
}

describe("RewardClearing", () => {
  it("owner opens a pool; claims succeed with distinct nullifiers", () => {
    const l = makeLedger();
    createRewardPool(l, { sk: "owner-sk", bidId: "bid1", amount: 800 });
    assert.equal(l.poolOpen, true);
    const n1 = claimReward(l, { secret: "l1", bidId: "bid1", amount: 500 });
    const n2 = claimReward(l, { secret: "l2", bidId: "bid1", amount: 300 });
    assert.notEqual(n1, n2);
  });
  it("rejects pool creation by non-owner", () => {
    const l = makeLedger();
    assert.throws(() => createRewardPool(l, { sk: "mallory", bidId: "b", amount: 1 }), /Not the contract owner/);
  });
  it("rejects claims when pool is closed", () => {
    const l = makeLedger();
    assert.throws(() => claimReward(l, { secret: "l1", bidId: "x", amount: 1 }), /Reward pool is not open/);
  });
  it("rejects claims for a different pool", () => {
    const l = makeLedger();
    createRewardPool(l, { sk: "owner-sk", bidId: "bid1", amount: 800 });
    assert.throws(() => claimReward(l, { secret: "l1", bidId: "bid2", amount: 10 }), /Claim is for a different pool/);
  });
  it("rejects claims exceeding the pool", () => {
    const l = makeLedger();
    createRewardPool(l, { sk: "owner-sk", bidId: "bid1", amount: 100 });
    assert.throws(() => claimReward(l, { secret: "l1", bidId: "bid1", amount: 101 }), /Claim exceeds pool/);
  });
  it("rejects double-claims (same secret replays)", () => {
    const l = makeLedger();
    createRewardPool(l, { sk: "owner-sk", bidId: "bid1", amount: 800 });
    claimReward(l, { secret: "l1", bidId: "bid1", amount: 100 });
    assert.throws(() => claimReward(l, { secret: "l1", bidId: "bid1", amount: 100 }), /Replayed reward claim rejected/);
  });
});
