import { createHash } from "node:crypto";
import {
  buildSlopstreamStack,
  ProofOfAttentionApi,
  type SlopstreamStack,
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
  /** Skip the faucet request and go straight to balance check. Use when the
   *  wallet was funded manually (e.g. via the faucet UI with captcha). */
  skipFaucetRequest?: boolean;
}): Promise<{
  stack: SlopstreamStack;
  api: ProofOfAttentionApi;
  shutdown: () => Promise<void>;
}> => {
  const seed = getWalletSeed();
  const stack = await buildSlopstreamStack(seed, logger);

  if (opts.fund) {
    const unshieldedState = await fundFromFaucetAndWait(
      stack.walletProvider,
      logger,
      { skipRequest: opts.skipFaucetRequest },
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
    }
    // Wait even when dustTx is undefined: UTXOs may already be registered
    // from a previous run while dust is still accruing.
    await waitForDust(stack);
  }

  const providers = stack.providersFor("proofofattention");
  const address = process.env.PROOF_OF_ATTENTION_CONTRACT_ADDRESS;
  const api = address
    ? await ProofOfAttentionApi.join(providers, address, logger)
    : await ProofOfAttentionApi.deploy(providers, logger);

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

export const waitForDust = async (stack: SlopstreamStack): Promise<void> => {
  // Dust becomes visible only once the dust sub-wallet's sync reaches the
  // registration tx — on preprod that is a multi-hour full-history grind, so
  // this deadline must be generous. Balance > 0 is NOT enough: the DUST
  // spend proof anchors to the wallet's dust tree at chain tip, so a
  // still-syncing wallet produces an InvalidDustSpendProof (1010/170).
  const deadline = Date.now() + 24 * 60 * 60_000;
  while (Date.now() < deadline) {
    const state = await new Promise<{
      dust: bigint;
      synced: boolean;
      detail: string;
    }>((resolve) => {
      const sub = stack.walletProvider.wallet.state().subscribe((s) => {
        const complete = (p: unknown): boolean =>
          !!(
            p &&
            typeof p === "object" &&
            typeof (p as { isStrictlyComplete?: unknown })
              .isStrictlyComplete === "function" &&
            (p as { isStrictlyComplete: () => boolean }).isStrictlyComplete()
          );
        const dustProgress = (s.dust as { state?: { progress?: unknown } })
          .state?.progress;
        const shieldedProgress = (
          s.shielded as { state?: { progress?: unknown } }
        ).state?.progress;
        const unshieldedProgress = (s.unshielded as { progress?: unknown })
          .progress;
        const dustC = complete(dustProgress);
        const shieldedC = complete(shieldedProgress);
        const unshieldedC = complete(unshieldedProgress);
        const applied =
          (dustProgress as Record<string, unknown> | undefined)?.appliedIndex ??
          (dustProgress as Record<string, unknown> | undefined)?.appliedId ??
          "?";
        resolve({
          dust: s.dust.balance(new Date()) ?? 0n,
          synced: dustC && shieldedC && unshieldedC,
          detail: `dust=${dustC} shielded=${shieldedC} unshielded=${unshieldedC} applied=${applied}`,
        });
        sub.unsubscribe();
      });
    });
    if (state.dust > 0n && state.synced) {
      logger.info(
        `Dust balance available and wallet at chain tip: ${state.dust} (${state.detail})`,
      );
      return;
    }
    logger.info(
      `Waiting for dust: balance=${state.dust} ${state.detail} (15s)`,
    );
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("Timed out waiting for dust balance.");
};

export const hashIdTo32Bytes = (id: string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(id).digest());
