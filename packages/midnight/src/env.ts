import { type EnvironmentConfiguration } from "@midnight-ntwrk/testkit-js";

export const preprodEnvironment: EnvironmentConfiguration = {
  walletNetworkId: "preprod",
  networkId: "preprod",
  indexer: "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWS: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  node: "https://rpc.preprod.midnight.network",
  nodeWS: "wss://rpc.preprod.midnight.network",
  faucet: "https://midnight-tmnight-preprod.nethermind.dev/",
  proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? "http://127.0.0.1:6300",
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
