import type { ChainId } from "./chain";
import type { LaunchpadId } from "./launchpad";

export type ScoreLevel = "Safe" | "Caution" | "Risky";

/** Inputs for the seeded 24h sparkline (see shared/lib/sparkline.ts). */
export interface SparkSeed {
  seed: number;
  drift: number;
  vol: number;
}

export interface TokenFlags {
  hot: boolean;
  og: boolean;
  isNew: boolean;
  locked: boolean;
  /** Crew fee share such as "2%", or null when the token has no crew rewards. */
  crew: string | null;
  agent: boolean;
}

/** Change and volume over one timeframe of the list toolbar. */
export interface TokenWindow {
  /** Change in percent. */
  change: number;
  /** Volume in USD. */
  volume: number;
}

export interface Token {
  /** Contract address: the token's unique id and its page URL. Mock tokens use the ticker. */
  address: string;
  ticker: string;
  name: string;
  chain: ChainId;
  launchpad: LaunchpadId;
  /** Bonding-curve progress from 0 to 1. 1 means the token has graduated. */
  curve: number;
  /** Mission score, 0–100. */
  score: number;
  level: ScoreLevel;
  spark: SparkSeed;
  /** Real market-cap points, oldest first; drawn instead of the seeded spark when present. */
  series?: readonly number[];
  /** 24h change in percent, e.g. 412.6 or -12.4. */
  change24h: number;
  /** 24h volume in USD. */
  volume24h: number;
  /** Change and volume per toolbar timeframe (live data); 24h values stand in when absent. */
  windows?: Partial<Record<"5m" | "1h" | "6h" | "24h", TokenWindow>>;
  /** Holder count, or null when not known yet. */
  holders: number | null;
  /** Number of tracked smart-money wallets holding the token. */
  smartWallets: number;
  /** Market cap in USD. */
  marketCap: number;
  flags: TokenFlags;
  /** Shortened creator address. */
  creator: string;
  ageMinutes: number;
  /** Token art: a path under /public or a remote URL ("" when there is none yet). */
  art: string;
  /** The verified issuer of a tokenized stock or RWA, e.g. "xStocks" (live data). Shows the Verified RWA badge. */
  issuer?: string;
  /** A tonkfun.fun launch (live data): the Block-0 Shield, a 99% tax on separate buys in its launch block and the next. */
  shield?: boolean;
}
