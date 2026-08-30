import { bootstrap, logger } from "./bootstrap.js";

const run = async (): Promise<void> => {
  const hasSeed = !!process.env.MIDNIGHT_WALLET_SEED;
  if (!hasSeed) {
    logger.info(
      "No MIDNIGHT_WALLET_SEED set — this run creates a fresh wallet and funds it from the faucet.",
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
