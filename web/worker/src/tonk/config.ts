import { mainnetNetwork, parseTonkMode, ROBINHOOD_UNISWAP } from "@/shared/tonk/networks";
import { type Address, lower } from "../alerts/types";

/** Where tonkfun.fun's own launchpad is, for the feed that lists its launches. */
export interface TonkFeedConfig {
  launchpad: Address;
  migrator: Address;
  /** Uniswap's official PoolManager: graduated pools are only read there. */
  poolManager: Address;
  /** The launchpad's deployment block, where the history starts. */
  startBlock: number;
  rpcUrl: string;
}

export type FeedEnv = Readonly<Record<string, string | undefined>>;

const text = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);
const isUrl = (raw: string) => /^https?:\/\/[^\s]+$/.test(raw);

/**
 * The feed follows the mainnet deployment the app itself is built for: the
 * same NEXT_PUBLIC_TONK_NETWORK=mainnet and the three NEXT_PUBLIC_TONK_
 * values, checked by the app's own `mainnetNetwork`. Anything else leaves it
 * off (testnet stays as it is). Its RPC is TONK_RPC_URL when set, else the
 * worker's Robinhood Chain logs RPC (the public one by default). Reads only:
 * the feed holds no key and sends nothing.
 */
export function loadTonkFeedConfig(env: FeedEnv, logsRpcUrl: string): { config: TonkFeedConfig | null; note: string } {
  if (parseTonkMode(env.NEXT_PUBLIC_TONK_NETWORK) !== "mainnet") return { config: null, note: "off: NEXT_PUBLIC_TONK_NETWORK is not mainnet" };
  const network = mainnetNetwork({ launchpad: env.NEXT_PUBLIC_TONK_LAUNCHPAD, migrator: env.NEXT_PUBLIC_TONK_MIGRATOR, block: env.NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK });
  if (!network) return { config: null, note: "off: mainnet needs NEXT_PUBLIC_TONK_LAUNCHPAD, _MIGRATOR and _LAUNCHPAD_BLOCK" };
  const rpc = text(env.TONK_RPC_URL);
  if (rpc !== null && !isUrl(rpc)) return { config: null, note: "off: TONK_RPC_URL isn't an http(s) URL" };
  return {
    config: {
      launchpad: lower(network.launchpad),
      migrator: lower(network.migrator),
      poolManager: lower(ROBINHOOD_UNISWAP.poolManager),
      startBlock: network.launchpadBlock,
      rpcUrl: rpc ?? logsRpcUrl,
    },
    note: `following launchpad ${network.launchpad} from block ${network.launchpadBlock}`,
  };
}
