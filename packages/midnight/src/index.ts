import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";

import * as CompiledProofOfAttention from "../contract/src/managed/proofofattention/contract/index.js";
import * as CompiledRewardClearing from "../contract/src/managed/rewardclearing/contract/index.js";
import * as CompiledPreviewRights from "../contract/src/managed/previewrightsthreshold/contract/index.js";
import * as Witnesses from "./witnesses.js";

export * from "../contract/src/managed/proofofattention/contract/index.js";
export * as RewardClearingCompiled from "../contract/src/managed/rewardclearing/contract/index.js";
export * as PreviewRightsCompiled from "../contract/src/managed/previewrightsthreshold/contract/index.js";
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

export const CompiledRewardClearingContract = CompiledContract.make<
  CompiledRewardClearing.Contract<Witnesses.RewardClearingPrivateState>
>(
  "RewardClearing",
  CompiledRewardClearing.Contract<Witnesses.RewardClearingPrivateState>,
).pipe(
  CompiledContract.withWitnesses(Witnesses.rewardClearingWitnesses),
  CompiledContract.withCompiledFileAssets(
    "../contract/src/managed/rewardclearing",
  ),
);

export const CompiledPreviewRightsContract = CompiledContract.make<
  CompiledPreviewRights.Contract<Witnesses.PreviewRightsPrivateState>
>(
  "PreviewRightsThreshold",
  CompiledPreviewRights.Contract<Witnesses.PreviewRightsPrivateState>,
).pipe(
  CompiledContract.withWitnesses(Witnesses.previewRightsWitnesses),
  CompiledContract.withCompiledFileAssets(
    "../contract/src/managed/previewrightsthreshold",
  ),
);
