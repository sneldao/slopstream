import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrap, logger } from "./bootstrap.js";

// Gitignored (see repo-root .gitignore). The freshly generated wallet seed is
// persisted here instead of being printed to the console/logs.
const walletSeedFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".wallet-seed",
);

const run = async (): Promise<void> => {
  const hasSeed = !!process.env.MIDNIGHT_WALLET_SEED;
  if (!hasSeed) {
    const seed = randomBytes(32).toString("hex");
    process.env.MIDNIGHT_WALLET_SEED = seed;
    await writeFile(walletSeedFile, `${seed}\n`, { mode: 0o600 });
    logger.info("No MIDNIGHT_WALLET_SEED set — generated a fresh wallet seed.");
    logger.warn(
      `Seed written to ${walletSeedFile} (gitignored, mode 0600). It is intentionally NOT printed here.`,
    );
    logger.warn(
      "Back that file up securely now — it is the only copy of the deployer wallet.",
    );
  }
  const { api, shutdown } = await bootstrap({ fund: true });
  try {
    logger.info("==============================================");
    logger.info("DEPLOYED. Save these values:");
    logger.info(`  Contract address: ${api.deployedContractAddress}`);
    if (!hasSeed) {
      logger.info(`  Wallet seed file: ${walletSeedFile}`);
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
