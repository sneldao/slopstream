import * as __compactRuntime from "@midnight-ntwrk/compact-runtime";
__compactRuntime.checkRuntimeVersion("0.16.0");

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(
  65535n,
  2,
);

const _descriptor_1 = new __compactRuntime.CompactTypeUnsignedInteger(
  18446744073709551615n,
  8,
);

const _descriptor_2 = __compactRuntime.CompactTypeBoolean;

const _descriptor_3 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_4 = new __compactRuntime.CompactTypeVector(3, _descriptor_3);

class _Either_0 {
  alignment() {
    return _descriptor_2
      .alignment()
      .concat(_descriptor_3.alignment().concat(_descriptor_3.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_2.fromValue(value_0),
      left: _descriptor_3.fromValue(value_0),
      right: _descriptor_3.fromValue(value_0),
    };
  }
  toValue(value_0) {
    return _descriptor_2
      .toValue(value_0.is_left)
      .concat(
        _descriptor_3
          .toValue(value_0.left)
          .concat(_descriptor_3.toValue(value_0.right)),
      );
  }
}

const _descriptor_5 = new _Either_0();

const _descriptor_6 = new __compactRuntime.CompactTypeUnsignedInteger(
  340282366920938463463374607431768211455n,
  16,
);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_3.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_3.fromValue(value_0),
    };
  }
  toValue(value_0) {
    return _descriptor_3.toValue(value_0.bytes);
  }
}

const _descriptor_7 = new _ContractAddress_0();

const _descriptor_8 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(
        `Contract constructor: expected 1 argument, received ${args_0.length}`,
      );
    }
    const witnesses_0 = args_0[0];
    if (typeof witnesses_0 !== "object") {
      throw new __compactRuntime.CompactError(
        "first (witnesses) argument to Contract constructor is not an object",
      );
    }
    if (typeof witnesses_0.localSecretKey !== "function") {
      throw new __compactRuntime.CompactError(
        "first (witnesses) argument to Contract constructor does not contain a function-valued field named localSecretKey",
      );
    }
    if (typeof witnesses_0.claimSecret !== "function") {
      throw new __compactRuntime.CompactError(
        "first (witnesses) argument to Contract constructor does not contain a function-valued field named claimSecret",
      );
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      publicKey(context, ...args_1) {
        return { result: pureCircuits.publicKey(...args_1), context };
      },
      createRewardPool: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(
            `createRewardPool: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`,
          );
        }
        const contextOrig_0 = args_1[0];
        const poolBidId_0 = args_1[1];
        const poolEligibleAmount_0 = args_1[2];
        if (!(
          typeof contextOrig_0 === "object" &&
          contextOrig_0.currentQueryContext != undefined
        )) {
          __compactRuntime.typeError(
            "createRewardPool",
            "argument 1 (as invoked from Typescript)",
            "RewardClearing.compact line 68 char 1",
            "CircuitContext",
            contextOrig_0,
          );
        }
        if (!(
          poolBidId_0.buffer instanceof ArrayBuffer &&
          poolBidId_0.BYTES_PER_ELEMENT === 1 &&
          poolBidId_0.length === 32
        )) {
          __compactRuntime.typeError(
            "createRewardPool",
            "argument 1 (argument 2 as invoked from Typescript)",
            "RewardClearing.compact line 68 char 1",
            "Bytes<32>",
            poolBidId_0,
          );
        }
        if (!(
          typeof poolEligibleAmount_0 === "bigint" &&
          poolEligibleAmount_0 >= 0n &&
          poolEligibleAmount_0 <= 18446744073709551615n
        )) {
          __compactRuntime.typeError(
            "createRewardPool",
            "argument 2 (argument 3 as invoked from Typescript)",
            "RewardClearing.compact line 68 char 1",
            "Uint<0..18446744073709551616>",
            poolEligibleAmount_0,
          );
        }
        const context = {
          ...contextOrig_0,
          gasCost: __compactRuntime.emptyRunningCost(),
        };
        const partialProofData = {
          input: {
            value: _descriptor_3
              .toValue(poolBidId_0)
              .concat(_descriptor_1.toValue(poolEligibleAmount_0)),
            alignment: _descriptor_3
              .alignment()
              .concat(_descriptor_1.alignment()),
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: [],
        };
        const result_0 = this._createRewardPool_0(
          context,
          partialProofData,
          poolBidId_0,
          poolEligibleAmount_0,
        );
        partialProofData.output = { value: [], alignment: [] };
        return {
          result: result_0,
          context: context,
          proofData: partialProofData,
          gasCost: context.gasCost,
        };
      },
      claimReward: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(
            `claimReward: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`,
          );
        }
        const contextOrig_0 = args_1[0];
        const poolBidId_0 = args_1[1];
        const claimAmountCents_0 = args_1[2];
        if (!(
          typeof contextOrig_0 === "object" &&
          contextOrig_0.currentQueryContext != undefined
        )) {
          __compactRuntime.typeError(
            "claimReward",
            "argument 1 (as invoked from Typescript)",
            "RewardClearing.compact line 80 char 1",
            "CircuitContext",
            contextOrig_0,
          );
        }
        if (!(
          poolBidId_0.buffer instanceof ArrayBuffer &&
          poolBidId_0.BYTES_PER_ELEMENT === 1 &&
          poolBidId_0.length === 32
        )) {
          __compactRuntime.typeError(
            "claimReward",
            "argument 1 (argument 2 as invoked from Typescript)",
            "RewardClearing.compact line 80 char 1",
            "Bytes<32>",
            poolBidId_0,
          );
        }
        if (!(
          typeof claimAmountCents_0 === "bigint" &&
          claimAmountCents_0 >= 0n &&
          claimAmountCents_0 <= 18446744073709551615n
        )) {
          __compactRuntime.typeError(
            "claimReward",
            "argument 2 (argument 3 as invoked from Typescript)",
            "RewardClearing.compact line 80 char 1",
            "Uint<0..18446744073709551616>",
            claimAmountCents_0,
          );
        }
        const context = {
          ...contextOrig_0,
          gasCost: __compactRuntime.emptyRunningCost(),
        };
        const partialProofData = {
          input: {
            value: _descriptor_3
              .toValue(poolBidId_0)
              .concat(_descriptor_1.toValue(claimAmountCents_0)),
            alignment: _descriptor_3
              .alignment()
              .concat(_descriptor_1.alignment()),
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: [],
        };
        const result_0 = this._claimReward_0(
          context,
          partialProofData,
          poolBidId_0,
          claimAmountCents_0,
        );
        partialProofData.output = {
          value: _descriptor_3.toValue(result_0),
          alignment: _descriptor_3.alignment(),
        };
        return {
          result: result_0,
          context: context,
          proofData: partialProofData,
          gasCost: context.gasCost,
        };
      },
    };
    this.impureCircuits = {
      createRewardPool: this.circuits.createRewardPool,
      claimReward: this.circuits.claimReward,
    };
    this.provableCircuits = {
      createRewardPool: this.circuits.createRewardPool,
      claimReward: this.circuits.claimReward,
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(
        `Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`,
      );
    }
    const constructorContext_0 = args_0[0];
    if (typeof constructorContext_0 !== "object") {
      throw new __compactRuntime.CompactError(
        `Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`,
      );
    }
    if (!("initialPrivateState" in constructorContext_0)) {
      throw new __compactRuntime.CompactError(
        `Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`,
      );
    }
    if (!("initialZswapLocalState" in constructorContext_0)) {
      throw new __compactRuntime.CompactError(
        `Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`,
      );
    }
    if (typeof constructorContext_0.initialZswapLocalState !== "object") {
      throw new __compactRuntime.CompactError(
        `Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`,
      );
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    stateValue_0 = stateValue_0.arrayPush(
      __compactRuntime.StateValue.newNull(),
    );
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation(
      "createRewardPool",
      new __compactRuntime.ContractOperation(),
    );
    state_0.setOperation(
      "claimReward",
      new __compactRuntime.ContractOperation(),
    );
    const context = __compactRuntime.createCircuitContext(
      __compactRuntime.dummyContractAddress(),
      constructorContext_0.initialZswapLocalState.coinPublicKey,
      state_0.data,
      constructorContext_0.initialPrivateState,
    );
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: [],
    };
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(0n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_1.toValue(0n),
            alignment: _descriptor_1.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(1n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(2n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_2.toValue(false),
            alignment: _descriptor_2.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(3n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(4n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(5n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(6n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(7n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(new Uint8Array(32)),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(8n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_1.toValue(0n),
            alignment: _descriptor_1.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    const tmp_0 = 0n;
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(0n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_1.toValue(tmp_0),
            alignment: _descriptor_1.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(1n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(
              new Uint8Array([
                115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99,
                58, 122, 101, 114, 111, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0,
              ]),
            ),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(2n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_2.toValue(false),
            alignment: _descriptor_2.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(3n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(
              new Uint8Array([
                115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99,
                58, 122, 101, 114, 111, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0,
              ]),
            ),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(4n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(
              new Uint8Array([
                115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99,
                58, 112, 114, 101, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0,
              ]),
            ),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(5n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(
              new Uint8Array([
                115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99,
                58, 112, 114, 101, 118, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0,
              ]),
            ),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(6n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(
              new Uint8Array([
                115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99,
                58, 112, 114, 101, 118, 51, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0,
              ]),
            ),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        idx: {
          cached: false,
          pushPath: true,
          path: [
            {
              tag: "value",
              value: {
                value: _descriptor_8.toValue(8n),
                alignment: _descriptor_8.alignment(),
              },
            },
          ],
        },
      },
      {
        addi: {
          immediate: parseInt(
            __compactRuntime.valueToBigInt(
              {
                value: _descriptor_0.toValue(tmp_1),
                alignment: _descriptor_0.alignment(),
              }.value,
            ),
          ),
        },
      },
      { ins: { cached: true, n: 1 } },
    ]);
    const tmp_2 = this._publicKey_0(
      this._localSecretKey_0(context, partialProofData),
      __compactRuntime.convertFieldToBytes(
        32,
        _descriptor_1.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(8n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: true, result: undefined } },
          ]).value,
        ),
        "RewardClearing.compact line 53 char 48",
      ),
    );
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(7n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(tmp_2),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    state_0.data = new __compactRuntime.ChargedState(
      context.currentQueryContext.state.state,
    );
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState,
    };
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_4, value_0);
    return result_0;
  }
  _localSecretKey_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(
      ledger(context.currentQueryContext.state),
      context.currentPrivateState,
      context.currentQueryContext.address,
    );
    const [nextPrivateState_0, result_0] =
      this.witnesses.localSecretKey(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(
      result_0.buffer instanceof ArrayBuffer &&
      result_0.BYTES_PER_ELEMENT === 1 &&
      result_0.length === 32
    )) {
      __compactRuntime.typeError(
        "localSecretKey",
        "return value",
        "RewardClearing.compact line 57 char 1",
        "Bytes<32>",
        result_0,
      );
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment(),
    });
    return result_0;
  }
  _claimSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(
      ledger(context.currentQueryContext.state),
      context.currentPrivateState,
      context.currentQueryContext.address,
    );
    const [nextPrivateState_0, result_0] =
      this.witnesses.claimSecret(witnessContext_0);
    context.currentPrivateState = nextPrivateState_0;
    if (!(
      result_0.buffer instanceof ArrayBuffer &&
      result_0.BYTES_PER_ELEMENT === 1 &&
      result_0.length === 32
    )) {
      __compactRuntime.typeError(
        "claimSecret",
        "return value",
        "RewardClearing.compact line 61 char 1",
        "Bytes<32>",
        result_0,
      );
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_3.toValue(result_0),
      alignment: _descriptor_3.alignment(),
    });
    return result_0;
  }
  _publicKey_0(sk_0, sequence_0) {
    return this._persistentHash_0([
      new Uint8Array([
        115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 112, 107, 58, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
      sequence_0,
      sk_0,
    ]);
  }
  _createRewardPool_0(
    context,
    partialProofData,
    poolBidId_0,
    poolEligibleAmount_0,
  ) {
    __compactRuntime.assert(
      this._equal_0(
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(7n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
        this._publicKey_0(
          this._localSecretKey_0(context, partialProofData),
          __compactRuntime.convertFieldToBytes(
            32,
            _descriptor_1.fromValue(
              __compactRuntime.queryLedgerState(context, partialProofData, [
                { dup: { n: 0 } },
                {
                  idx: {
                    cached: false,
                    pushPath: false,
                    path: [
                      {
                        tag: "value",
                        value: {
                          value: _descriptor_8.toValue(8n),
                          alignment: _descriptor_8.alignment(),
                        },
                      },
                    ],
                  },
                },
                { popeq: { cached: true, result: undefined } },
              ]).value,
            ),
            "RewardClearing.compact line 69 char 47",
          ),
        ),
      ),
      "Not the contract owner",
    );
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(1n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(poolBidId_0),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(0n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_1.toValue(poolEligibleAmount_0),
            alignment: _descriptor_1.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(2n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_2.toValue(true),
            alignment: _descriptor_2.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        idx: {
          cached: false,
          pushPath: true,
          path: [
            {
              tag: "value",
              value: {
                value: _descriptor_8.toValue(8n),
                alignment: _descriptor_8.alignment(),
              },
            },
          ],
        },
      },
      {
        addi: {
          immediate: parseInt(
            __compactRuntime.valueToBigInt(
              {
                value: _descriptor_0.toValue(tmp_0),
                alignment: _descriptor_0.alignment(),
              }.value,
            ),
          ),
        },
      },
      { ins: { cached: true, n: 1 } },
    ]);
    return [];
  }
  _claimReward_0(context, partialProofData, poolBidId_0, claimAmountCents_0) {
    __compactRuntime.assert(
      _descriptor_2.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(2n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      ),
      "Reward pool is not open",
    );
    __compactRuntime.assert(
      this._equal_1(
        poolBidId_0,
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(1n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      ),
      "Claim is for a different pool",
    );
    __compactRuntime.assert(
      claimAmountCents_0 <=
        _descriptor_1.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(0n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      "Claim exceeds pool",
    );
    const nullifier_0 = this._persistentHash_0([
      this._claimSecret_0(context, partialProofData),
      poolBidId_0,
      new Uint8Array([
        115, 108, 111, 112, 115, 116, 114, 101, 97, 109, 58, 114, 99, 58, 99,
        108, 97, 105, 109, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
    ]);
    __compactRuntime.assert(
      !this._equal_2(
        nullifier_0,
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(3n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      ),
      "Replayed reward claim rejected",
    );
    __compactRuntime.assert(
      !this._equal_3(
        nullifier_0,
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(4n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      ),
      "Replayed reward claim rejected",
    );
    __compactRuntime.assert(
      !this._equal_4(
        nullifier_0,
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(5n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      ),
      "Replayed reward claim rejected",
    );
    __compactRuntime.assert(
      !this._equal_5(
        nullifier_0,
        _descriptor_3.fromValue(
          __compactRuntime.queryLedgerState(context, partialProofData, [
            { dup: { n: 0 } },
            {
              idx: {
                cached: false,
                pushPath: false,
                path: [
                  {
                    tag: "value",
                    value: {
                      value: _descriptor_8.toValue(6n),
                      alignment: _descriptor_8.alignment(),
                    },
                  },
                ],
              },
            },
            { popeq: { cached: false, result: undefined } },
          ]).value,
        ),
      ),
      "Replayed reward claim rejected",
    );
    const tmp_0 = _descriptor_3.fromValue(
      __compactRuntime.queryLedgerState(context, partialProofData, [
        { dup: { n: 0 } },
        {
          idx: {
            cached: false,
            pushPath: false,
            path: [
              {
                tag: "value",
                value: {
                  value: _descriptor_8.toValue(5n),
                  alignment: _descriptor_8.alignment(),
                },
              },
            ],
          },
        },
        { popeq: { cached: false, result: undefined } },
      ]).value,
    );
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(6n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(tmp_0),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    const tmp_1 = _descriptor_3.fromValue(
      __compactRuntime.queryLedgerState(context, partialProofData, [
        { dup: { n: 0 } },
        {
          idx: {
            cached: false,
            pushPath: false,
            path: [
              {
                tag: "value",
                value: {
                  value: _descriptor_8.toValue(4n),
                  alignment: _descriptor_8.alignment(),
                },
              },
            ],
          },
        },
        { popeq: { cached: false, result: undefined } },
      ]).value,
    );
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(5n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(tmp_1),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    const tmp_2 = _descriptor_3.fromValue(
      __compactRuntime.queryLedgerState(context, partialProofData, [
        { dup: { n: 0 } },
        {
          idx: {
            cached: false,
            pushPath: false,
            path: [
              {
                tag: "value",
                value: {
                  value: _descriptor_8.toValue(3n),
                  alignment: _descriptor_8.alignment(),
                },
              },
            ],
          },
        },
        { popeq: { cached: false, result: undefined } },
      ]).value,
    );
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(4n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(tmp_2),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    __compactRuntime.queryLedgerState(context, partialProofData, [
      {
        push: {
          storage: false,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_8.toValue(3n),
            alignment: _descriptor_8.alignment(),
          }).encode(),
        },
      },
      {
        push: {
          storage: true,
          value: __compactRuntime.StateValue.newCell({
            value: _descriptor_3.toValue(nullifier_0),
            alignment: _descriptor_3.alignment(),
          }).encode(),
        },
      },
      { ins: { cached: false, n: 1 } },
    ]);
    return nullifier_0;
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
  _equal_3(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
  _equal_4(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
  _equal_5(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) {
      return false;
    }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state =
    stateOrChargedState instanceof __compactRuntime.StateValue
      ? stateOrChargedState
      : stateOrChargedState.state;
  const chargedState =
    stateOrChargedState instanceof __compactRuntime.StateValue
      ? new __compactRuntime.ChargedState(stateOrChargedState)
      : stateOrChargedState;
  const context = {
    currentQueryContext: new __compactRuntime.QueryContext(
      chargedState,
      __compactRuntime.dummyContractAddress(),
    ),
    costModel: __compactRuntime.CostModel.initialCostModel(),
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: [],
  };
  return {
    get eligibleAmount() {
      return _descriptor_1.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(0n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get bidId() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(1n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get poolOpen() {
      return _descriptor_2.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(2n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get lastClaimNullifier() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(3n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get prevClaimNullifier1() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(4n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get prevClaimNullifier2() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(5n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get prevClaimNullifier3() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(6n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get owner() {
      return _descriptor_3.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(7n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: false, result: undefined } },
        ]).value,
      );
    },
    get sequence() {
      return _descriptor_1.fromValue(
        __compactRuntime.queryLedgerState(context, partialProofData, [
          { dup: { n: 0 } },
          {
            idx: {
              cached: false,
              pushPath: false,
              path: [
                {
                  tag: "value",
                  value: {
                    value: _descriptor_8.toValue(8n),
                    alignment: _descriptor_8.alignment(),
                  },
                },
              ],
            },
          },
          { popeq: { cached: true, result: undefined } },
        ]).value,
      );
    },
  };
}
const _emptyContext = {
  currentQueryContext: new __compactRuntime.QueryContext(
    new __compactRuntime.ContractState().data,
    __compactRuntime.dummyContractAddress(),
  ),
};
const _dummyContract = new Contract({
  localSecretKey: (...args) => undefined,
  claimSecret: (...args) => undefined,
});
export const pureCircuits = {
  publicKey: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(
        `publicKey: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`,
      );
    }
    const sk_0 = args_0[0];
    const sequence_0 = args_0[1];
    if (!(
      sk_0.buffer instanceof ArrayBuffer &&
      sk_0.BYTES_PER_ELEMENT === 1 &&
      sk_0.length === 32
    )) {
      __compactRuntime.typeError(
        "publicKey",
        "argument 1",
        "RewardClearing.compact line 63 char 1",
        "Bytes<32>",
        sk_0,
      );
    }
    if (!(
      sequence_0.buffer instanceof ArrayBuffer &&
      sequence_0.BYTES_PER_ELEMENT === 1 &&
      sequence_0.length === 32
    )) {
      __compactRuntime.typeError(
        "publicKey",
        "argument 2",
        "RewardClearing.compact line 63 char 1",
        "Bytes<32>",
        sequence_0,
      );
    }
    return _dummyContract._publicKey_0(sk_0, sequence_0);
  },
};
export const contractReferenceLocations = {
  tag: "publicLedgerArray",
  indices: {},
};
//# sourceMappingURL=index.js.map
