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

export interface Token {
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
  /** 24h change in percent, e.g. 412.6 or -12.4. */
  change24h: number;
  /** 24h volume in USD. */
  volume24h: number;
  holders: number;
  /** Number of tracked smart-money wallets holding the token. */
  smartWallets: number;
  /** Market cap in USD. */
  marketCap: number;
  flags: TokenFlags;
  /** Shortened creator address. */
  creator: string;
  ageMinutes: number;
  /** Path to the token art under /public. */
  art: string;
}
