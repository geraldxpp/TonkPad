import { jsonRpc, type RpcCall } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import type { BridgeNetwork } from "../lib/networks";

const PUBLIC: Record<string, readonly string[]> = {
  eth: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
  base: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  arb: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
  op: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
  polygon: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
  bnb: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
  avax: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"],
  unichain: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"],
  linea: ["https://rpc.linea.build", "https://linea-rpc.publicnode.com"],
  ink: ["https://rpc-gel.inkonchain.com", "https://ink.drpc.org"],
  world: ["https://worldchain-mainnet.g.alchemy.com/public", "https://480.rpc.thirdweb.com"],
  monad: ["https://rpc3.monad.xyz", "https://rpc.monad.xyz"],
  hyperevm: ["https://rpc.hyperliquid.xyz/evm"],
  zksync: ["https://mainnet.era.zksync.io"],
  scroll: ["https://rpc.scroll.io"],
};

/** The same Alchemy key that reads Robinhood Chain reads these too, where the app has them on. */
const ALCHEMY: Record<string, string> = {
  eth: "eth-mainnet",
  base: "base-mainnet",
  arb: "arb-mainnet",
  op: "opt-mainnet",
  polygon: "polygon-mainnet",
  bnb: "bnb-mainnet",
  avax: "avax-mainnet",
  unichain: "unichain-mainnet",
  linea: "linea-mainnet",
  ink: "ink-mainnet",
  world: "worldchain-mainnet",
  monad: "monad-mainnet",
  zksync: "zksync-mainnet",
  scroll: "scroll-mainnet",
};

const REST_MS = 300_000;
const resting = new Map<string, number>();

/** For tests. */
export const clearRpcRest = () => resting.clear();

/** Tries each endpoint in turn, leaving one that just failed out for a while. Errors never name a URL. */
export function firstAnswering(urls: readonly string[], connect: (url: string) => RpcCall = jsonRpc): RpcCall {
  return async (method, params) => {
    const now = Date.now();
    const awake = urls.filter((url) => (resting.get(url) ?? 0) <= now);
    let failure: unknown = new Error("no RPC");
    for (const url of awake.length > 0 ? awake : urls) {
      try {
        return await connect(url)(method, params);
      } catch (error) {
        failure = error;
        resting.set(url, Date.now() + REST_MS);
      }
    }
    throw failure;
  };
}

function alchemyUrl(id: string, env: Readonly<Record<string, string | undefined>>): string | null {
  const subdomain = ALCHEMY[id];
  const match = /^https:\/\/[\w-]+\.g\.alchemy\.com\/v2\/([\w-]+)$/.exec(env.ROBINHOOD_RPC_URL?.trim() ?? "");
  return subdomain && match ? `https://${subdomain}.g.alchemy.com/v2/${match[1]}` : null;
}

/** An RPC for any of the bridge's networks, on the server only. */
export function rpcFor(network: BridgeNetwork, env: Readonly<Record<string, string | undefined>> = process.env): RpcCall {
  if (network.id === "rh" || network.id === "sol") return jsonRpc(walletRpcUrl(network.id, env));
  const alchemy = alchemyUrl(network.id, env);
  return firstAnswering([...(alchemy ? [alchemy] : []), ...(PUBLIC[network.id] ?? [])]);
}
