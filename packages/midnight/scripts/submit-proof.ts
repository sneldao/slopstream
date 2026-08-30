import { bootstrap, hashIdTo32Bytes, logger } from "./bootstrap.js";

const run = async (): Promise<void> => {
  const segmentId =
    process.argv[2] ?? `demo-segment-${Math.floor(Math.random() * 1_000_000)}`;
  const challengeId =
    process.argv[3] ??
    `demo-challenge-${Math.floor(Math.random() * 1_000_000)}`;

  const { api, shutdown } = await bootstrap({ fund: true });
  try {
    logger.info(
      `Submitting attention proof for segment=${segmentId} challenge=${challengeId}`,
    );
    const receipt = await api.submitAttentionProof(
      hashIdTo32Bytes(segmentId),
      hashIdTo32Bytes(challengeId),
    );
    logger.info("Proof accepted on Midnight:");
    logger.info(`  txHash:      ${receipt.txHash}`);
    logger.info(`  blockHeight: ${receipt.blockHeight}`);
    logger.info(
      `  nullifier:   ${Buffer.from(receipt.nullifier).toString("hex")}`,
    );

    const state = await api.readLedgerState();
    if (state) {
      logger.info(
        `verifiedCount is now ${state.verifiedCount} (threshold ${state.attentionThreshold}).`,
      );
    }
  } finally {
    await shutdown();
  }
};

run().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
