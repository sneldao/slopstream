import { createVerifierServer } from "./server.js";

const configuredMode = process.env.VERIFIER_MODE ?? "stub";
const port = Number(process.env.PORT ?? 4100);

async function startStubServer(): Promise<void> {
  const server = createVerifierServer({
    apiToken: process.env.VERIFIER_API_TOKEN || undefined,
    verifierMode: "stub",
  });
  server.listen(port, () => {
    console.log(`slopstream proof verifier listening on :${port} (stub mode)`);
  });
}

async function startMidnightServer(): Promise<void> {
  const walletSeed = process.env.MIDNIGHT_WALLET_SEED;
  const contractAddress = process.env.PROOF_OF_ATTENTION_CONTRACT_ADDRESS;
  if (!walletSeed || !/^[0-9a-fA-F]{64}$/.test(walletSeed)) {
    throw new Error(
      "VERIFIER_MODE=midnight requires MIDNIGHT_WALLET_SEED (64 hex characters).",
    );
  }
  if (!contractAddress) {
    throw new Error(
      "VERIFIER_MODE=midnight requires PROOF_OF_ATTENTION_CONTRACT_ADDRESS (run packages/midnight deploy first).",
    );
  }

  const { buildAttentionStack, ProofOfAttentionApi } =
    await import("@slopstream/midnight");
  const { createMidnightAttentionProofVerifier } =
    await import("./midnightVerifier.js");

  console.log(
    "Starting Midnight wallet and joining ProofOfAttention contract...",
  );
  const stack = await buildAttentionStack(walletSeed, {
    info: (msg) => console.log(`[midnight] ${msg}`),
  });
  const api = await ProofOfAttentionApi.join(stack.providers, contractAddress, {
    info: (msg) => console.log(`[midnight] ${msg}`),
  });

  const server = createVerifierServer({
    apiToken: process.env.VERIFIER_API_TOKEN || undefined,
    verifier: createMidnightAttentionProofVerifier(api),
    verifierMode: "midnight",
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await stack.stop();
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  server.listen(port, () => {
    console.log(
      `slopstream proof verifier listening on :${port} (midnight mode, contract ${contractAddress})`,
    );
  });
}

if (configuredMode === "stub") {
  void startStubServer();
} else if (configuredMode === "midnight") {
  void startMidnightServer();
} else {
  throw new Error(
    `Unsupported VERIFIER_MODE=${configuredMode}. Supported modes: "stub", "midnight".`,
  );
}
