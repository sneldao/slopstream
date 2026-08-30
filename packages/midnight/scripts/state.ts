import { bootstrap, logger } from "./bootstrap.js";

const run = async (): Promise<void> => {
  const { api, shutdown } = await bootstrap({ fund: false });
  try {
    const state = await api.readLedgerState();
    if (state === null) {
      logger.info("Contract not found at the given address.");
      return;
    }
    logger.info("ProofOfAttention ledger state:");
    logger.info(`  verifiedCount:     ${state.verifiedCount}`);
    logger.info(`  attentionThreshold: ${state.attentionThreshold}`);
    logger.info(`  thresholdMet:      ${state.thresholdMet}`);
    logger.info(
      `  lastNullifier:     ${Buffer.from(state.lastNullifier).toString("hex")}`,
    );
    logger.info(`  sequence:          ${state.sequence}`);
  } finally {
    await shutdown();
  }
};

run().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
