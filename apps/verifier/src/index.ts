import { createVerifierServer } from "./server.js";

const configuredMode = process.env.VERIFIER_MODE ?? "stub";
const port = Number(process.env.PORT ?? 4100);

/** Demo value documented in .env.example — never accepted in production. */
const DEMO_VERIFIER_TOKEN = "slopstream-demo-verifier-token";

/**
 * Mirrors the apps/api `serviceCredential` guard: outside dev the verify
 * endpoint must be authenticated. In midnight mode every forged proof
 * submits a real chain transaction and drains the verifier wallet, so an
 * open endpoint in production is a direct fund-loss bug. Zero-config dev
 * keeps working: an unset token leaves the endpoint open locally.
 */
function verifierApiToken(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configured = env.VERIFIER_API_TOKEN?.trim();
  if (
    env.NODE_ENV === "production" &&
    (!configured || configured === DEMO_VERIFIER_TOKEN)
  ) {
    throw new Error(
      "VERIFIER_API_TOKEN must be set to a real secret when NODE_ENV=production; refusing to start with an open verify endpoint.",
    );
  }
  return configured || undefined;
}

const apiToken = verifierApiToken();

async function startStubServer(): Promise<void> {
  const server = createVerifierServer({
    apiToken,
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
    apiToken,
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
