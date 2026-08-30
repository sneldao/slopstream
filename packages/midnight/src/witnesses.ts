import { type WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { type Ledger } from "../contract/src/managed/proofofattention/contract/index.js";

export type ProofOfAttentionPrivateState = {
  readonly localSecretKey: Uint8Array;
  readonly listenerSecret: Uint8Array;
};

export const createProofOfAttentionPrivateState = (
  localSecretKey: Uint8Array,
  listenerSecret: Uint8Array,
): ProofOfAttentionPrivateState => ({ localSecretKey, listenerSecret });

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
