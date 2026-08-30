import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";

import * as CompiledProofOfAttention from "../contract/src/managed/proofofattention/contract/index.js";
import * as Witnesses from "./witnesses.js";

export * from "../contract/src/managed/proofofattention/contract/index.js";
export * from "./witnesses.js";
export * from "./env.js";
export * from "./wallet.js";
export * from "./api.js";

export const CompiledProofOfAttentionContract = CompiledContract.make<
  CompiledProofOfAttention.Contract<Witnesses.ProofOfAttentionPrivateState>
>(
  "ProofOfAttention",
  CompiledProofOfAttention.Contract<Witnesses.ProofOfAttentionPrivateState>,
).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets(
    "../contract/src/managed/proofofattention",
  ),
);
