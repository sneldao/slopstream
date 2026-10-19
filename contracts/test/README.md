# Contract circuit mirrors

Offline mirrors of `../src/*.compact`, byte-for-byte semantics (domain tags,
field order, revert strings). Run with zero installs:

```bash
node --test contracts/test/*.test.mjs
```

Expected: 18 pass / 0 fail (6 ProofOfAttention + 6 RewardClearing + 6 PreviewRightsThreshold).
Each failing case pins the exact Compact `assert` message judges will hit on-chain.
