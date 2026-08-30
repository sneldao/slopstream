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
  CompiledProofOfAttentionContract,
  type ProofOfAttentionPrivateState,
  createProofOfAttentionPrivateState,
} from "./index.js";
import {
  preprodEnvironment,
  proofOfAttentionPrivateStateKey,
  type PrivateStateId,
  type AttentionCircuitKeys,
} from "./env.js";
import { MidnightWalletProvider } from "./wallet.js";

export type AttentionProviders = MidnightProviders<
  AttentionCircuitKeys,
  PrivateStateId,
  ProofOfAttentionPrivateState
>;

export type DeployedAttentionContract = FoundContract<
  Contract<ProofOfAttentionPrivateState>
>;

const zkConfigPath = path.resolve(
  new URL(".", import.meta.url).pathname,
  "..",
  "contract",
  "src",
  "managed",
  "proofofattention",
);

export type MinimalLogger = {
  info: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
};

export interface AttentionStack {
  readonly providers: AttentionProviders;
  readonly walletProvider: MidnightWalletProvider;
  stop(): Promise<void>;
}

export const buildAttentionStack = async (
  walletSeed: string,
  logger: MinimalLogger,
): Promise<AttentionStack> => {
  setNetworkId(preprodEnvironment.networkId);

  const walletProvider = await MidnightWalletProvider.build(
    preprodEnvironment,
    walletSeed,
  );
  await walletProvider.start();

  const zkConfigProvider = new NodeZkConfigProvider<AttentionCircuitKeys>(
    zkConfigPath,
  );
  const providers: AttentionProviders = {
    privateStateProvider: levelPrivateStateProvider<
      PrivateStateId,
      ProofOfAttentionPrivateState
    >({
      privateStateStoreName:
        process.env.MIDNIGHT_PRIVATE_STATE_STORE ??
        "slopstream-attention-private-state",
      signingKeyStoreName: "slopstream-attention-signing-keys",
      privateStoragePasswordProvider: () =>
        process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD ??
        "slopstream-hackathon-2026",
      accountId: walletSeed,
    }),
    publicDataProvider: indexerPublicDataProvider(
      preprodEnvironment.indexer,
      preprodEnvironment.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      preprodEnvironment.proofServer,
      zkConfigProvider,
    ),
    walletProvider,
    midnightProvider: walletProvider,
  };

  logger.info("Midnight attention stack started (preprod).");

  return {
    providers,
    walletProvider,
    stop: async () => {
      await walletProvider.stop();
    },
  };
};

export interface AttentionProofReceipt {
  readonly contractAddress: ContractAddress;
  readonly txHash: string;
  readonly blockHeight: number;
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
