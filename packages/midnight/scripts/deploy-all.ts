import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWalletSeed, logger, waitForDust } from "./bootstrap.js";
import {
  buildSlopstreamStack,
  ProofOfAttentionApi,
  RewardClearingApi,
  PreviewRightsApi,
} from "../src/index.js";
import { fundFromFaucetAndWait, generateDust } from "../src/wallet.js";

// Wave 3 deploy: all three contracts from one funded wallet, then write the
// deployment record the verifier, /verify page, and judges all read.

const walletSeedFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".wallet-seed",
);
const deploymentFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "contracts",
  "preprod",
  "deployment.json",
);

const run = async (): Promise<void> => {
  const hasSeed = !!process.env.MIDNIGHT_WALLET_SEED;
  let seed: string;
  if (hasSeed) {
    seed = getWalletSeed();
  } else {
    seed = randomBytes(32).toString("hex");
    process.env.MIDNIGHT_WALLET_SEED = seed;
    await writeFile(walletSeedFile, `${seed}\n`, { mode: 0o600 });
    logger.warn(
      `No MIDNIGHT_WALLET_SEED set — generated a fresh seed at ${walletSeedFile} (gitignored, mode 0600). Back it up: it is the only copy of the deployer wallet.`,
    );
  }

  const stack = await buildSlopstreamStack(seed, logger);
  try {
    const unshieldedState = await fundFromFaucetAndWait(
      stack.walletProvider,
      logger,
      { skipRequest: process.env.SKIP_FUNDS_REQUEST === "1" },
    );
    const dustTx = await generateDust(
      stack.walletProvider,
      seed,
      unshieldedState,
      logger,
    );
    if (dustTx) {
      logger.info(`Dust generation registered (tx ${dustTx}). Waiting...`);
      await waitForDust(stack);
    }

    // Join when an address env var is set (idempotent re-runs), else deploy.
    const poaAddress = process.env.PROOF_OF_ATTENTION_CONTRACT_ADDRESS;
    const poaProviders = stack.providersFor("proofofattention");
    const poa = poaAddress
      ? await ProofOfAttentionApi.join(poaProviders, poaAddress, logger)
      : await ProofOfAttentionApi.deploy(poaProviders, logger);
    logger.info(`ProofOfAttention: ${poa.deployedContractAddress}`);

    const rcAddress = process.env.REWARD_CLEARING_CONTRACT_ADDRESS;
    const rcProviders = stack.providersFor("rewardclearing");
    const rc = rcAddress
      ? await RewardClearingApi.join(rcProviders, rcAddress, logger)
      : await RewardClearingApi.deploy(rcProviders, logger);
    logger.info(`RewardClearing: ${rc.deployedContractAddress}`);

    const prtAddress = process.env.PREVIEW_RIGHTS_CONTRACT_ADDRESS;
    const prtProviders = stack.providersFor("previewrightsthreshold");
    const prt = prtAddress
      ? await PreviewRightsApi.join(prtProviders, prtAddress, logger)
      : await PreviewRightsApi.deploy(prtProviders, logger);
    logger.info(`PreviewRightsThreshold: ${prt.deployedContractAddress}`);

    const deployment = {
      network: "midnight-preprod",
      toolchain: { compact: "0.31.1", language: "0.23" },
      deployedAt: new Date().toISOString(),
      contracts: {
        ProofOfAttention: {
          address: poa.deployedContractAddress,
          deployTx: poa.deployedContract.deployTxData.public.txHash,
          circuits: [
            "submitAttentionProof",
            "setAttentionThreshold",
            "publicKey",
          ],
        },
        RewardClearing: {
          address: rc.deployedContractAddress,
          deployTx: rc.deployedContract.deployTxData.public.txHash,
          circuits: ["createRewardPool", "claimReward", "publicKey"],
        },
        PreviewRightsThreshold: {
          address: prt.deployedContractAddress,
          deployTx: prt.deployedContract.deployTxData.public.txHash,
          circuits: [
            "setSpendThreshold",
            "recordSpend",
            "proveQualification",
            "publicKey",
          ],
        },
      },
      note: "Verifier wiring: set VERIFIER_MODE=midnight + PROOF_OF_ATTENTION_CONTRACT_ADDRESS in apps/verifier.",
    };
    await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
    logger.info(`Deployment record written to ${deploymentFile}`);
    logger.info("==============================================");
    logger.info("DEPLOYED (Wave 3). Set these to run midnight mode:");
    logger.info(`  export MIDNIGHT_WALLET_SEED=${hasSeed ? "<seed>" : seed}`);
    logger.info(
      `  export PROOF_OF_ATTENTION_CONTRACT_ADDRESS=${poa.deployedContractAddress}`,
    );
    logger.info("==============================================");
  } finally {
    await stack.stop();
  }
};

run().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
