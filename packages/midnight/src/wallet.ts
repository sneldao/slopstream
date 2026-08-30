import {
  type CoinPublicKey,
  DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  LedgerParameters,
  ZswapSecretKeys,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import {
  type MidnightProvider,
  type UnboundTransaction,
  type WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { ttlOneHour } from "@midnight-ntwrk/midnight-js-utils";
import { type WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import {
  type DustWalletOptions,
  type EnvironmentConfiguration,
  FaucetClient,
  FluentWalletBuilder,
} from "@midnight-ntwrk/testkit-js";
import {
  createKeystore,
  type UnshieldedWalletState,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { unshieldedToken } from "@midnight-ntwrk/midnight-js-protocol/ledger";
import { UnshieldedAddress } from "@midnight-ntwrk/wallet-sdk-address-format";
import * as Rx from "rxjs";

type UnshieldedKeystore = {
  getPublicKey(): unknown;
  signData(payload: Uint8Array): string;
};

export class MidnightWalletProvider
  implements MidnightProvider, WalletProvider
{
  readonly env: EnvironmentConfiguration;
  readonly wallet: WalletFacade;
  readonly unshieldedKeystore: UnshieldedKeystore;
  readonly zswapSecretKeys: ZswapSecretKeys;
  readonly dustSecretKey: DustSecretKey;
  readonly seed: string;

  private constructor(
    environmentConfiguration: EnvironmentConfiguration,
    wallet: WalletFacade,
    zswapSecretKeys: ZswapSecretKeys,
    dustSecretKey: DustSecretKey,
    unshieldedKeystore: UnshieldedKeystore,
    seed: string,
  ) {
    this.env = environmentConfiguration;
    this.wallet = wallet;
    this.zswapSecretKeys = zswapSecretKeys;
    this.dustSecretKey = dustSecretKey;
    this.unshieldedKeystore = unshieldedKeystore;
    this.seed = seed;
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.zswapSecretKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.zswapSecretKeys.encryptionPublicKey;
  }

  async balanceTx(
    tx: UnboundTransaction,
    ttl: Date = ttlOneHour(),
  ): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      {
        shieldedSecretKeys: this.zswapSecretKeys,
        dustSecretKey: this.dustSecretKey,
      },
      { ttl },
    );
    const signedRecipe = await this.wallet.signRecipe(recipe, (payload) =>
      this.unshieldedKeystore.signData(payload),
    );
    return this.wallet.finalizeRecipe(signedRecipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  async start(): Promise<void> {
    await this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
  }

  async stop(): Promise<void> {
    return this.wallet.stop();
  }

  static async build(
    env: EnvironmentConfiguration,
    seed?: string,
  ): Promise<MidnightWalletProvider> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead:
        env.walletNetworkId === "undeployed"
          ? 500_000_000_000_000_000n
          : 1_000n,
      feeBlocksMargin: 5,
    };
    const builder =
      FluentWalletBuilder.forEnvironment(env).withDustOptions(dustOptions);
    const buildResult = seed
      ? await builder.withSeed(seed).buildWithoutStarting()
      : await builder.withRandomSeed().buildWithoutStarting();
    const { wallet, seeds, keystore } = buildResult as unknown as {
      wallet: WalletFacade;
      seeds: { masterSeed: string; shielded: Uint8Array; dust: Uint8Array };
      keystore: UnshieldedKeystore;
    };

    return new MidnightWalletProvider(
      env,
      wallet,
      ZswapSecretKeys.fromSeed(seeds.shielded),
      DustSecretKey.fromSeed(seeds.dust),
      keystore,
      seeds.masterSeed,
    );
  }
}

export const getUnshieldedSeed = (seed: string): Uint8Array => {
  const seedBuffer = Buffer.from(seed, "hex");
  const hdWalletResult = HDWallet.fromSeed(seedBuffer);
  const { hdWallet } = hdWalletResult as { type: "seedOk"; hdWallet: HDWallet };
  const derivationResult = hdWallet
    .selectAccount(0)
    .selectRole(Roles.NightExternal)
    .deriveKeyAt(0);
  if (derivationResult.type === "keyOutOfBounds") {
    throw new Error("Key derivation out of bounds");
  }
  return derivationResult.key;
};

export const fundFromFaucetAndWait = async (
  walletProvider: MidnightWalletProvider,
  logger: { info: (msg: string) => void },
): Promise<UnshieldedWalletState> => {
  const wallet = walletProvider.wallet;
  const initialState = await Rx.firstValueFrom(wallet.unshielded.state);
  const address = initialState.address;
  const encoded = UnshieldedAddress.codec.encode(getNetworkId(), address);
  logger.info(`Unshielded address: ${encoded.toString()}`);

  const balance = initialState.balances[unshieldedToken().raw];
  if (balance === undefined || balance === 0n) {
    logger.info("Requesting tNIGHT from faucet...");
    await new FaucetClient(
      walletProvider.env.faucet!,
      logger as never,
    ).requestTokens(encoded.toString());
    logger.info("Waiting for faucet funds to arrive (2-3 minutes)...");
    return Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.filter(
          (state) =>
            (state.unshielded.balances[unshieldedToken().raw] ?? 0n) > 0n,
        ),
        Rx.map((state) => state.unshielded),
      ),
    );
  }
  return initialState;
};

export const generateDust = async (
  walletProvider: MidnightWalletProvider,
  seed: string,
  unshieldedState: UnshieldedWalletState,
  logger: { info: (msg: string) => void },
): Promise<string | undefined> => {
  const wallet = walletProvider.wallet;
  await wallet.dust.waitForSyncedState();
  const networkId = getNetworkId();
  const unshieldedKeystore = createKeystore(getUnshieldedSeed(seed), networkId);
  const utxos = unshieldedState.availableCoins.filter(
    (coin) => !coin.meta.registeredForDustGeneration,
  );
  if (utxos.length === 0) {
    logger.info("No unregistered UTXOs found for dust generation.");
    return undefined;
  }
  logger.info(`Generating tDUST from ${utxos.length} UTXOs...`);
  const dustState = await wallet.dust.waitForSyncedState();
  const recipe = await wallet.registerNightUtxosForDustGeneration(
    utxos,
    unshieldedKeystore.getPublicKey(),
    (payload) => unshieldedKeystore.signData(payload),
    dustState.address,
  );
  const transaction = await wallet.finalizeRecipe(recipe);
  return wallet.submitTransaction(transaction);
};
