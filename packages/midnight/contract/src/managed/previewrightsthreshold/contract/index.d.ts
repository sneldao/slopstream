import type * as __compactRuntime from "@midnight-ntwrk/compact-runtime";

export type Witnesses<PS> = {
  localSecretKey(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
  ): [PS, Uint8Array];
  actualSpendCents(
    context: __compactRuntime.WitnessContext<Ledger, PS>,
  ): [PS, bigint];
};

export type ImpureCircuits<PS> = {
  setSpendThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  recordSpend(
    context: __compactRuntime.CircuitContext<PS>,
    spendCents_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  proveQualification(
    context: __compactRuntime.CircuitContext<PS>,
  ): __compactRuntime.CircuitResults<PS, boolean>;
};

export type ProvableCircuits<PS> = {
  setSpendThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  recordSpend(
    context: __compactRuntime.CircuitContext<PS>,
    spendCents_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  proveQualification(
    context: __compactRuntime.CircuitContext<PS>,
  ): __compactRuntime.CircuitResults<PS, boolean>;
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
  setSpendThreshold(
    context: __compactRuntime.CircuitContext<PS>,
    newThreshold_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  recordSpend(
    context: __compactRuntime.CircuitContext<PS>,
    spendCents_0: bigint,
  ): __compactRuntime.CircuitResults<PS, []>;
  proveQualification(
    context: __compactRuntime.CircuitContext<PS>,
  ): __compactRuntime.CircuitResults<PS, boolean>;
};

export type Ledger = {
  readonly spendThreshold: bigint;
  readonly qualified: boolean;
  readonly spendCommitment: Uint8Array;
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
