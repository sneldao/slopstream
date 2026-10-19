import { type EnvironmentConfiguration } from "@midnight-ntwrk/testkit-js";

// Midnight retired its own hosted preprod indexer/RPC on 2026-10-09
// (indexer returns HTTP 410 ENDPOINT_DECOMMISSIONED since 2026-10-13).
// Blockfrost is now the public provider for preprod + mainnet and every
// request needs a project token, appended as ?project_id= — the documented
// pattern for clients like midnight-js that can't set custom headers.
// Create a Midnight Preprod project at https://blockfrost.io.
const blockfrostProjectId = process.env.MIDNIGHT_BLOCKFROST_PROJECT_ID ?? "";
const projectIdSuffix = blockfrostProjectId
  ? `?project_id=${blockfrostProjectId}`
  : "";

export const preprodEnvironment: EnvironmentConfiguration = {
  walletNetworkId: "preprod",
  networkId: "preprod",
  indexer: `https://midnight-preprod.blockfrost.io/api/v0${projectIdSuffix}`,
  indexerWS: `wss://midnight-preprod.blockfrost.io/api/v0/ws${projectIdSuffix}`,
  node: `https://rpc.midnight-preprod.blockfrost.io${projectIdSuffix}`,
  nodeWS: `wss://rpc.midnight-preprod.blockfrost.io${projectIdSuffix}`,
  faucet: "https://midnight-tmnight-preprod.nethermind.dev/",
  proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? "http://127.0.0.1:6300",
};

/** Fail fast with an actionable error instead of a stream of HTTP 403s. */
export const assertMidnightEndpointsConfigured = (): void => {
  if (!blockfrostProjectId) {
    throw new Error(
      "MIDNIGHT_BLOCKFROST_PROJECT_ID is not set. The Midnight-hosted preprod indexer/RPC were decommissioned 2026-10-09; create a Midnight Preprod project at https://blockfrost.io and set the token.",
    );
  }
};

export const proofOfAttentionPrivateStateKey = "proofOfAttentionPrivateState";
export const rewardClearingPrivateStateKey = "rewardClearingPrivateState";
export const previewRightsPrivateStateKey = "previewRightsPrivateState";

export type PrivateStateId =
  | typeof proofOfAttentionPrivateStateKey
  | typeof rewardClearingPrivateStateKey
  | typeof previewRightsPrivateStateKey;

export type AttentionCircuitKeys =
  "submitAttentionProof" | "setAttentionThreshold";

export type RewardClearingCircuitKeys = "createRewardPool" | "claimReward";

export type PreviewRightsCircuitKeys =
  "setSpendThreshold" | "recordSpend" | "proveQualification";
