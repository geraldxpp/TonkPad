import { isChainAddress } from "@/shared/lib/address";
import { fetchWorker, isLiveMode } from "@/shared/live/server";
import type { ChainId } from "@/shared/types/chain";
import type { LiveList } from "@/shared/types/live";
import type { SparkSeed, Token } from "@/shared/types/token";

/** A token the picker offers and the context card describes. Decimals come from the swap API once it's picked. */
export interface SwapListing {
  chain: ChainId;
  address: string;
  symbol: string;
  name: string;
  /** Art path or URL; "" when there is none. */
  art: string;
  marketCap: number;
  change24h: number;
  spark: SparkSeed;
  series?: readonly number[];
}

export interface SwapData {
  /** Trending tokens per chain, most active first. Empty without live data: mock tokens have no real addresses. */
  listings: Record<ChainId, SwapListing[]>;
}

const PER_CHAIN = 30;

const toListing = (token: Token): SwapListing => ({
  chain: token.chain,
  address: token.address,
  symbol: token.ticker,
  name: token.name,
  art: token.art,
  marketCap: token.marketCap,
  change24h: token.change24h,
  spark: token.spark,
  series: token.series,
});

/** Only tokens with a real address on their chain can be quoted. */
const tradable = (rows: readonly Token[]) => rows.filter((token) => isChainAddress(token.chain, token.address)).slice(0, PER_CHAIN).map(toListing);

/**
 * Swap's data: with the live worker, each chain's trending tokens; without
 * it, none (the base coins and pasted addresses still work).
 */
export async function getSwapData(): Promise<SwapData> {
  if (!isLiveMode()) return { listings: { sol: [], rh: [] } };
  const read = (chain: ChainId) =>
    fetchWorker<LiveList>(`/v1/list?chain=${chain}&tab=trending&tf=24h`)
      .then((list) => tradable(list.rows))
      .catch(() => []);
  const [sol, rh] = await Promise.all([read("sol"), read("rh")]);
  return { listings: { sol, rh } };
}
