import { WebSocket } from "ws";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Needed so the Apollo-based indexer client can use WebSockets under Node.
(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

import {
  deployContract,
  findDeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { type ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import { assertIsContractAddress } from "@midnight-ntwrk/midnight-js-utils";
import { type MidnightProviders } from "@midnight-ntwrk/midnight-js-types";

import {
  type Contract,
  type Ledger,
  ledger,
} from "../contract/src/managed/proofofattention/contract/index.js";
import {
  type Contract as RewardClearingContractType,
  type Ledger as RewardClearingLedger,
  ledger as rewardClearingLedger,
} from "../contract/src/managed/rewardclearing/contract/index.js";
import {
  type Contract as PreviewRightsContractType,
  type Ledger as PreviewRightsLedger,
  ledger as previewRightsLedger,
} from "../contract/src/managed/previewrightsthreshold/contract/index.js";
import {
  CompiledProofOfAttentionContract,
  CompiledRewardClearingContract,
  CompiledPreviewRightsContract,
  type ProofOfAttentionPrivateState,
  type RewardClearingPrivateState,
  type PreviewRightsPrivateState,
  createProofOfAttentionPrivateState,
  createRewardClearingPrivateState,
  createPreviewRightsPrivateState,
} from "./index.js";
import {
  preprodEnvironment,
  proofOfAttentionPrivateStateKey,
  rewardClearingPrivateStateKey,
  previewRightsPrivateStateKey,
  type PrivateStateId,
  type AttentionCircuitKeys,
  type RewardClearingCircuitKeys,
  type PreviewRightsCircuitKeys,
} from "./env.js";
import { MidnightWalletProvider } from "./wallet.js";

export type AttentionProviders = MidnightProviders<
  AttentionCircuitKeys,
  PrivateStateId,
  ProofOfAttentionPrivateState
>;

export type RewardClearingProviders = MidnightProviders<
  RewardClearingCircuitKeys,
  PrivateStateId,
  RewardClearingPrivateState
>;

export type PreviewRightsProviders = MidnightProviders<
  PreviewRightsCircuitKeys,
  PrivateStateId,
  PreviewRightsPrivateState
>;

export type DeployedAttentionContract = FoundContract<
  Contract<ProofOfAttentionPrivateState>
>;

export type DeployedRewardClearingContract = FoundContract<
  RewardClearingContractType<RewardClearingPrivateState>
>;

export type DeployedPreviewRightsContract = FoundContract<
  PreviewRightsContractType<PreviewRightsPrivateState>
>;

const managedRoot = path.resolve(
  new URL(".", import.meta.url).pathname,
  "..",
  "contract",
  "src",
  "managed",
);

export type ManagedContractName =
  "proofofattention" | "rewardclearing" | "previewrightsthreshold";

export type MinimalLogger = {
  info: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

export interface SlopstreamStack {
  readonly walletProvider: MidnightWalletProvider;
  /**
   * Builds a providers object for one managed contract. Each contract gets
   * its own private-state provider (a distinct LevelDB store and its own
   * setContractAddress scope) and its own zk-config path, so the three
   * contracts can share one funded wallet without key or state collisions.
   */
  providersFor(contract: "proofofattention"): AttentionProviders;
  providersFor(contract: "rewardclearing"): RewardClearingProviders;
  providersFor(contract: "previewrightsthreshold"): PreviewRightsProviders;
  providersFor(
    contract: ManagedContractName,
  ): AttentionProviders | RewardClearingProviders | PreviewRightsProviders;
  stop(): Promise<void>;
}

/** @deprecated Use SlopstreamStack + providersFor. Kept for bootstrap.ts. */
export type AttentionStack = SlopstreamStack;

export const buildSlopstreamStack = async (
  walletSeed: string,
  logger: MinimalLogger,
): Promise<SlopstreamStack> => {
  setNetworkId(preprodEnvironment.networkId);

  // The previous hardcoded fallback password was removed: it protected the
  // LevelDB private-state/signing-key store for everyone identically. The
  // stack refuses to start without an explicitly configured password.
  const storagePassword = process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD;
  if (!storagePassword) {
    throw new Error(
      "MIDNIGHT_PRIVATE_STATE_PASSWORD must be set: it protects the LevelDB private-state and signing-key stores. There is no default.",
    );
  }

  const walletProvider = await MidnightWalletProvider.build(
    preprodEnvironment,
    walletSeed,
  );
  await walletProvider.start();

  const publicDataProvider = indexerPublicDataProvider(
    preprodEnvironment.indexer,
    preprodEnvironment.indexerWS,
  );

  const providersFor = <K extends string, PS>(
    contract: ManagedContractName,
  ): MidnightProviders<K, PrivateStateId, PS> => {
    const zkConfigProvider = new NodeZkConfigProvider<K>(
      path.join(managedRoot, contract),
    );
    return {
      privateStateProvider: levelPrivateStateProvider<PrivateStateId, PS>({
        privateStateStoreName:
          process.env.MIDNIGHT_PRIVATE_STATE_STORE ??
          `slopstream-${contract}-private-state`,
        signingKeyStoreName: `slopstream-${contract}-signing-keys`,
        privateStoragePasswordProvider: () => storagePassword,
        // SECURITY NOTE: accountId is the wallet seed itself, and the LevelDB
        // private-state store persists account-scoped entries keyed by it.
        // Anyone with read access to the store directory can recover the seed
        // and control the wallet. Keep the store directory private; using a
        // non-secret account id would be safer (not re-architected here).
        accountId: walletSeed,
      }),
      publicDataProvider,
      zkConfigProvider,
      proofProvider: httpClientProofProvider(
        preprodEnvironment.proofServer,
        zkConfigProvider,
      ),
      walletProvider,
      midnightProvider: walletProvider,
    };
  };

  logger.info("Midnight stack started (preprod).");

  return {
    walletProvider,
    providersFor: providersFor as SlopstreamStack["providersFor"],
    stop: async () => {
      await walletProvider.stop();
    },
  };
};

export const buildAttentionStack = async (
  walletSeed: string,
  logger: MinimalLogger,
): Promise<SlopstreamStack> => buildSlopstreamStack(walletSeed, logger);

export interface ContractCallReceipt {
  readonly contractAddress: ContractAddress;
  readonly txHash: string;
  readonly blockHeight: number;
}

export interface AttentionProofReceipt extends ContractCallReceipt {
  readonly nullifier: Uint8Array;
}

export class ProofOfAttentionApi {
  private constructor(
    public readonly deployedContract: DeployedAttentionContract,
    private readonly providers: AttentionProviders,
    private readonly logger?: MinimalLogger,
  ) {
    this.deployedContractAddress =
      deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(
      this.deployedContractAddress,
    );
  }

  readonly deployedContractAddress: ContractAddress;

  static async deploy(
    providers: AttentionProviders,
    logger?: MinimalLogger,
  ): Promise<ProofOfAttentionApi> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledProofOfAttentionContract,
      privateStateId: proofOfAttentionPrivateStateKey,
      initialPrivateState: createProofOfAttentionPrivateState(
        randomBytes(32),
        randomBytes(32),
      ),
    });
    return new ProofOfAttentionApi(
      deployed as DeployedAttentionContract,
      providers,
      logger,
    );
  }

  static async join(
    providers: AttentionProviders,
    contractAddress: string,
    logger?: MinimalLogger,
  ): Promise<ProofOfAttentionApi> {
    assertIsContractAddress(contractAddress);
    const deployed = await findDeployedContract<
      Contract<ProofOfAttentionPrivateState>
    >(providers, {
      contractAddress,
      compiledContract: CompiledProofOfAttentionContract,
      privateStateId: proofOfAttentionPrivateStateKey,
      initialPrivateState: createProofOfAttentionPrivateState(
        randomBytes(32),
        randomBytes(32),
      ),
    });
    return new ProofOfAttentionApi(
      deployed as DeployedAttentionContract,
      providers,
      logger,
    );
  }

  /**
   * Records a verified attention proof on Midnight. A fresh ephemeral listener
   * secret is generated for every submission, so no listener can be linked
   * across proofs. Returns the public receipt: tx hash plus the on-chain
   * nullifier proving exactly-once consumption.
   */
  async submitAttentionProof(
    segmentId: Uint8Array,
    challengeId: Uint8Array,
  ): Promise<AttentionProofReceipt> {
    const existing = await this.providers.privateStateProvider.get(
      proofOfAttentionPrivateStateKey,
    );
    if (existing === null) {
      throw new Error(
        "Missing private state; deploy or join the contract first",
      );
    }
    await this.providers.privateStateProvider.set(
      proofOfAttentionPrivateStateKey,
      {
        ...existing,
        listenerSecret: randomBytes(32),
      },
    );

    this.logger?.info("Submitting attention proof to Midnight...");
    const txData = await this.deployedContract.callTx.submitAttentionProof(
      segmentId,
      challengeId,
    );
    const receipt: AttentionProofReceipt = {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
      nullifier: (txData as { result?: Uint8Array }).result ?? new Uint8Array(),
    };
    this.logger?.info(
      `Attention proof recorded on Midnight (tx ${receipt.txHash}).`,
    );
    return receipt;
  }

  async readLedgerState(): Promise<Ledger | null> {
    const contractState =
      await this.providers.publicDataProvider.queryContractState(
        this.deployedContractAddress,
      );
    return contractState != null ? ledger(contractState.data) : null;
  }
}

/**
 * RewardClearing — owner opens a reward pool per cleared bid; listeners claim
 * shares proven against a per-claim nullifier so no claim replays. Share
 * weights stay off-chain; the contract records the claim fact.
 */
export class RewardClearingApi {
  private constructor(
    public readonly deployedContract: DeployedRewardClearingContract,
    private readonly providers: RewardClearingProviders,
    private readonly logger?: MinimalLogger,
  ) {
    this.deployedContractAddress =
      deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(
      this.deployedContractAddress,
    );
  }

  readonly deployedContractAddress: ContractAddress;

  static async deploy(
    providers: RewardClearingProviders,
    logger?: MinimalLogger,
  ): Promise<RewardClearingApi> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledRewardClearingContract,
      privateStateId: rewardClearingPrivateStateKey,
      initialPrivateState: createRewardClearingPrivateState(
        randomBytes(32),
        randomBytes(32),
      ),
    });
    return new RewardClearingApi(
      deployed as DeployedRewardClearingContract,
      providers,
      logger,
    );
  }

  static async join(
    providers: RewardClearingProviders,
    contractAddress: string,
    logger?: MinimalLogger,
  ): Promise<RewardClearingApi> {
    assertIsContractAddress(contractAddress);
    const deployed = await findDeployedContract<
      RewardClearingContractType<RewardClearingPrivateState>
    >(providers, {
      contractAddress,
      compiledContract: CompiledRewardClearingContract,
      privateStateId: rewardClearingPrivateStateKey,
      initialPrivateState: createRewardClearingPrivateState(
        randomBytes(32),
        randomBytes(32),
      ),
    });
    return new RewardClearingApi(
      deployed as DeployedRewardClearingContract,
      providers,
      logger,
    );
  }

  async createRewardPool(
    bidId: Uint8Array,
    eligibleAmountCents: bigint,
  ): Promise<ContractCallReceipt> {
    this.logger?.info("Creating reward pool on Midnight...");
    const txData = await this.deployedContract.callTx.createRewardPool(
      bidId,
      eligibleAmountCents,
    );
    return {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
    };
  }

  /**
   * Claims a listener's share of the open pool. A fresh claim secret is
   * generated per claim so claims cannot be linked across pools; the returned
   * nullifier is the exactly-once receipt.
   */
  async claimReward(
    bidId: Uint8Array,
    amountCents: bigint,
  ): Promise<AttentionProofReceipt> {
    const existing = await this.providers.privateStateProvider.get(
      rewardClearingPrivateStateKey,
    );
    if (existing === null) {
      throw new Error(
        "Missing private state; deploy or join the contract first",
      );
    }
    await this.providers.privateStateProvider.set(
      rewardClearingPrivateStateKey,
      {
        ...existing,
        claimSecret: randomBytes(32),
      },
    );

    const txData = await this.deployedContract.callTx.claimReward(
      bidId,
      amountCents,
    );
    return {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
      nullifier: (txData as { result?: Uint8Array }).result ?? new Uint8Array(),
    };
  }

  async readLedgerState(): Promise<RewardClearingLedger | null> {
    const contractState =
      await this.providers.publicDataProvider.queryContractState(
        this.deployedContractAddress,
      );
    return contractState != null
      ? rewardClearingLedger(contractState.data)
      : null;
  }
}

/**
 * PreviewRightsThreshold — a brand proves it crossed a spend threshold
 * without revealing the amount. recordSpend commits the private spend;
 * proveQualification reveals only the boolean.
 */
export class PreviewRightsApi {
  private constructor(
    public readonly deployedContract: DeployedPreviewRightsContract,
    private readonly providers: PreviewRightsProviders,
    private readonly logger?: MinimalLogger,
  ) {
    this.deployedContractAddress =
      deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(
      this.deployedContractAddress,
    );
  }

  readonly deployedContractAddress: ContractAddress;

  static async deploy(
    providers: PreviewRightsProviders,
    logger?: MinimalLogger,
  ): Promise<PreviewRightsApi> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledPreviewRightsContract,
      privateStateId: previewRightsPrivateStateKey,
      initialPrivateState: createPreviewRightsPrivateState(randomBytes(32), 0n),
    });
    return new PreviewRightsApi(
      deployed as DeployedPreviewRightsContract,
      providers,
      logger,
    );
  }

  static async join(
    providers: PreviewRightsProviders,
    contractAddress: string,
    logger?: MinimalLogger,
  ): Promise<PreviewRightsApi> {
    assertIsContractAddress(contractAddress);
    const deployed = await findDeployedContract<
      PreviewRightsContractType<PreviewRightsPrivateState>
    >(providers, {
      contractAddress,
      compiledContract: CompiledPreviewRightsContract,
      privateStateId: previewRightsPrivateStateKey,
      initialPrivateState: createPreviewRightsPrivateState(randomBytes(32), 0n),
    });
    return new PreviewRightsApi(
      deployed as DeployedPreviewRightsContract,
      providers,
      logger,
    );
  }

  /** Owner-only: commits the brand's cumulative spend (stays private). */
  async recordSpend(spendCents: bigint): Promise<ContractCallReceipt> {
    const txData = await this.deployedContract.callTx.recordSpend(spendCents);
    return {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
    };
  }

  /** Owner-only: updates the threshold that unlocks premium rights. */
  async setSpendThreshold(
    thresholdCents: bigint,
  ): Promise<ContractCallReceipt> {
    const txData =
      await this.deployedContract.callTx.setSpendThreshold(thresholdCents);
    return {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
    };
  }

  /**
   * Proves spend >= threshold against the committed spend. The caller passes
   * the true spend into private state; only the boolean is revealed on-chain.
   */
  async proveQualification(
    actualSpendCents: bigint,
  ): Promise<ContractCallReceipt> {
    const existing = await this.providers.privateStateProvider.get(
      previewRightsPrivateStateKey,
    );
    if (existing === null) {
      throw new Error(
        "Missing private state; deploy or join the contract first",
      );
    }
    await this.providers.privateStateProvider.set(
      previewRightsPrivateStateKey,
      {
        ...existing,
        actualSpendCents,
      },
    );
    const txData = await this.deployedContract.callTx.proveQualification();
    return {
      contractAddress: this.deployedContractAddress,
      txHash: txData.public.txHash,
      blockHeight: txData.public.blockHeight,
    };
  }

  async readLedgerState(): Promise<PreviewRightsLedger | null> {
    const contractState =
      await this.providers.publicDataProvider.queryContractState(
        this.deployedContractAddress,
      );
    return contractState != null
      ? previewRightsLedger(contractState.data)
      : null;
  }
}
