import type * as __compactRuntime from "@midnight-ntwrk/compact-runtime";

export type Witnesses<PS> = {
  localSecretKey(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
  ): [PS, Uint8Array];
  listenerSecret(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
  ): [PS, Uint8Array];
};

export type ImpureCircuits<PS> = {
  submitAttentionProof(
    context: __compactRuntime.CircuitContext<PS>,
    segmentId_0: Uint8Array,
    challengeId_0: Uint8Array,
  ): __compactRuntime.CircuitResults<PS, Uint8Array>;
  setAttentionThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
};

export type ProvableCircuits<PS> = {
  submitAttentionProof(
    context: __compactRuntime.CircuitContext<PS>,
    segmentId_0: Uint8Array,
    challengeId_0: Uint8Array,
  ): __compactRuntime.CircuitResults<PS, Uint8Array>;
  setAttentionThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
};

export type PureCircuits = {
  publicKey(sk_0: Uint8Array, sequence_0: Uint8Array): Uint8Array;
};

export type Circuits<PS> = {
  publicKey(
    context: __compactRuntime.CircuitContext<PS>,
    sk_0: Uint8Array,
    sequence_0: Uint8Array,
  ): __compactRuntime.CircuitResults<PS, Uint8Array>;
  submitAttentionProof(
    context: __compactRuntime.CircuitContext<PS>,
    segmentId_0: Uint8Array,
    challengeId_0: Uint8Array,
  ): __compactRuntime.CircuitResults<PS, Uint8Array>;
  setAttentionThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
};

export type Ledger = {
  readonly verifiedCount: bigint;
  readonly lastNullifier: Uint8Array;
  readonly prevNullifier1: Uint8Array;
  readonly prevNullifier2: Uint8Array;
  readonly prevNullifier3: Uint8Array;
  readonly attentionThreshold: bigint;
  readonly thresholdMet: boolean;
  readonly owner: Uint8Array;
  readonly sequence: bigint;
};

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations: ContractReferenceLocations;

export declare class Contract<
  PS = any,
  W extends Witnesses<PS> = Witnesses<PS>,
> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(
    context: __compactRuntime.ConstructorContext<PS>,
  ): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(
  state: __compactRuntime.StateValue | __compactRuntime.ChargedState,
): Ledger;
export declare const pureCircuits: PureCircuits;
