import { type WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { type Ledger } from "../contract/src/managed/proofofattention/contract/index.js";
import { type Ledger as RewardClearingLedger } from "../contract/src/managed/rewardclearing/contract/index.js";
import { type Ledger as PreviewRightsLedger } from "../contract/src/managed/previewrightsthreshold/contract/index.js";

export type ProofOfAttentionPrivateState = {
  readonly localSecretKey: Uint8Array;
  readonly listenerSecret: Uint8Array;
};

export type RewardClearingPrivateState = {
  readonly localSecretKey: Uint8Array;
  readonly claimSecret: Uint8Array;
};

export type PreviewRightsPrivateState = {
  readonly localSecretKey: Uint8Array;
  readonly actualSpendCents: bigint;
};

export const createProofOfAttentionPrivateState = (
  localSecretKey: Uint8Array,
  listenerSecret: Uint8Array,
): ProofOfAttentionPrivateState => ({ localSecretKey, listenerSecret });

export const createRewardClearingPrivateState = (
  localSecretKey: Uint8Array,
  claimSecret: Uint8Array,
): RewardClearingPrivateState => ({ localSecretKey, claimSecret });

export const createPreviewRightsPrivateState = (
  localSecretKey: Uint8Array,
  actualSpendCents: bigint,
): PreviewRightsPrivateState => ({ localSecretKey, actualSpendCents });

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, ProofOfAttentionPrivateState>): [
    ProofOfAttentionPrivateState,
    Uint8Array,
  ] => [privateState, privateState.localSecretKey],
  listenerSecret: ({
    privateState,
  }: WitnessContext<Ledger, ProofOfAttentionPrivateState>): [
    ProofOfAttentionPrivateState,
    Uint8Array,
  ] => [privateState, privateState.listenerSecret],
};

export const rewardClearingWitnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<RewardClearingLedger, RewardClearingPrivateState>): [
    RewardClearingPrivateState,
    Uint8Array,
  ] => [privateState, privateState.localSecretKey],
  claimSecret: ({
    privateState,
  }: WitnessContext<RewardClearingLedger, RewardClearingPrivateState>): [
    RewardClearingPrivateState,
    Uint8Array,
  ] => [privateState, privateState.claimSecret],
};

export const previewRightsWitnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<PreviewRightsLedger, PreviewRightsPrivateState>): [
    PreviewRightsPrivateState,
    Uint8Array,
  ] => [privateState, privateState.localSecretKey],
  actualSpendCents: ({
    privateState,
  }: WitnessContext<PreviewRightsLedger, PreviewRightsPrivateState>): [
    PreviewRightsPrivateState,
    bigint,
  ] => [privateState, privateState.actualSpendCents],
};
