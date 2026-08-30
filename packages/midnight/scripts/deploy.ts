import { randomBytes } from "node:crypto";
import { bootstrap, logger } from "./bootstrap.js";

const run = async (): Promise<void> => {
  const hasSeed = !!process.env.MIDNIGHT_WALLET_SEED;
  if (!hasSeed) {
    const seed = randomBytes(32).toString("hex");
    process.env.MIDNIGHT_WALLET_SEED = seed;
    logger.info("No MIDNIGHT_WALLET_SEED set — generated a fresh wallet seed:");
    logger.info(`  ${seed}`);
    logger.info(
      "SAVE THIS SEED NOW — it is the only copy of the deployer wallet.",
    );
  }
  const { api, stack, shutdown } = await bootstrap({ fund: true });
  try {
    logger.info("==============================================");
    logger.info("DEPLOYED. Save these values:");
    logger.info(`  Contract address: ${api.deployedContractAddress}`);
    if (!hasSeed) {
      logger.info(`  Wallet seed:      ${stack.walletProvider.seed}`);
    }
    logger.info("Then set:");
    logger.info("  export MIDNIGHT_WALLET_SEED=<seed>");
    logger.info("  export PROOF_OF_ATTENTION_CONTRACT_ADDRESS=<address>");
    logger.info("==============================================");
  } finally {
    await shutdown();
  }
};

run().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
