import { createHash } from "node:crypto";
import {
  buildAttentionStack,
  ProofOfAttentionApi,
  type AttentionStack,
} from "../src/index.js";
import { fundFromFaucetAndWait, generateDust } from "../src/wallet.js";
import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss" },
  },
  level: process.env.LOG_LEVEL ?? "info",
});

export const getWalletSeed = (): string => {
  const seed = process.env.MIDNIGHT_WALLET_SEED;
  if (!seed || !/^[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error(
      "Set MIDNIGHT_WALLET_SEED to a 64-hex-character wallet seed (the deploy script writes one to packages/midnight/.wallet-seed).",
    );
  }
  return seed;
};

export const getContractAddress = (): string => {
  const address = process.env.PROOF_OF_ATTENTION_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error(
      "Set PROOF_OF_ATTENTION_CONTRACT_ADDRESS to the deployed contract address.",
    );
  }
  return address;
};

export const bootstrap = async (opts: {
  fund?: boolean;
}): Promise<{
  stack: AttentionStack;
  api: ProofOfAttentionApi;
  shutdown: () => Promise<void>;
}> => {
  const seed = getWalletSeed();
  const stack = await buildAttentionStack(seed, logger);

  if (opts.fund) {
    const unshieldedState = await fundFromFaucetAndWait(
      stack.walletProvider,
      logger,
    );
    const dustTx = await generateDust(
      stack.walletProvider,
      seed,
      unshieldedState,
      logger,
    );
    if (dustTx) {
      logger.info(
        `Dust generation registered (tx ${dustTx}). Waiting for dust balance...`,
      );
      await waitForDust(stack);
    }
  }

  const address = process.env.PROOF_OF_ATTENTION_CONTRACT_ADDRESS;
  const api = address
    ? await ProofOfAttentionApi.join(stack.providers, address, logger)
    : await ProofOfAttentionApi.deploy(stack.providers, logger);

  logger.info(
    `ProofOfAttention contract address: ${api.deployedContractAddress}`,
  );

  return {
    stack,
    api,
    shutdown: async () => {
      await stack.stop();
    },
  };
};

const waitForDust = async (stack: AttentionStack): Promise<void> => {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const state = await new Promise<{ dust: bigint }>((resolve) => {
      const sub = stack.walletProvider.wallet.state().subscribe((s) => {
        resolve({ dust: s.dust.balance(new Date()) ?? 0n });
        sub.unsubscribe();
      });
    });
    if (state.dust > 0n) {
      logger.info(`Dust balance available: ${state.dust}`);
      return;
    }
    logger.info("No dust yet; dust accrues block by block. Waiting 15s...");
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("Timed out waiting for dust balance.");
};

export const hashIdTo32Bytes = (id: string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(id).digest());
