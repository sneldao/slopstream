// Pin @midnight-ntwrk/wallet-sdk-dust-wallet to 4.2.0 everywhere.
// wallet-sdk@1.1.0 (pulled in via testkit-js) declares ^4.1.0 which resolves
// to 4.1.0 — its subscribeWallet drops the resume cursor when the indexer
// closes the WS subscription (Blockfrost closes every ~6 min), so dust
// sync never progresses. 4.2.0 rewrote the sync loop to survive reconnects.
// pnpm-workspace.yaml `overrides` does not rewrite specs inside published
// manifests under pnpm v10, hence the readPackage hook.
function readPackage(pkg) {
  const dep = "@midnight-ntwrk/wallet-sdk-dust-wallet";
  if (pkg.dependencies && pkg.dependencies[dep]) {
    pkg.dependencies[dep] = "4.2.0";
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
