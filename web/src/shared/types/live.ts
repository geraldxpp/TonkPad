import type { ChainId } from "./chain";
import type { LaunchpadId } from "./launchpad";
import type { Token } from "./token";

/**
 * The JSON contract between the live-data worker (web/worker) and the app.
 * The worker computes these; the app's /api/live routes pass them through.
 */

export type LiveTimeframe = "5m" | "1h" | "6h" | "24h";

export type LiveTabId = "trending" | "new" | "graduating" | "graduated" | "gainers" | "smart" | "locked";

export type LivePadFilter = "all" | LaunchpadId;

export type LiveChainFilter = "all" | ChainId;

export interface LiveListQuery {
  chain: LiveChainFilter;
  pad: LivePadFilter;
  tab: LiveTabId;
  tf: LiveTimeframe;
  q: string;
  limit: number;
}

/** One page of the token list for a view. */
export interface LiveList {
  rows: Token[];
  /** Tokens that match the view (for Load more). */
  matched: number;
  /** Tokens tracked today, across every chain and launchpad. */
  total: number;
  updatedAt: number;
}

export interface LiveStat {
  id: "tokensToday" | "volume24h" | "launched5m" | "graduatedToday";
  value: number;
  kind: "count" | "usd";
}

export interface LiveBlip {
  address: string;
  ticker: string;
  art: string;
  /** Degrees, clockwise from 3 o'clock. */
  angle: number;
  /** 0 (centre) to 1 (rim). */
  distance: number;
  size: number;
  label: string | null;
  glow: string;
  labelSide: "left" | "right" | null;
}

export interface LivePick {
  token: Token;
  price: number;
  updatedSecondsAgo: number;
}

/** Everything above the token list, plus the filter counts. */
export interface LiveOverview {
  stats: LiveStat[];
  totalTokens: number;
  missionPick: LivePick | null;
  heating: Array<{ token: Token; color: string }>;
  blips: LiveBlip[];
  /** Launchpads the radar is sweeping, by name, and how many more. */
  scope: { pads: string[]; more: number };
  launchpads: Array<{ id: LivePadFilter; count: number }>;
  moreLaunchpads: number;
  chainCounts: Record<LiveChainFilter, number>;
  updatedAt: number;
}

export interface LiveTapeItem {
  address: string;
  ticker: string;
  art: string;
  marketCap: number;
  change24h: number;
}

export interface LiveStatus {
  solUsd: number | null;
  ethUsd: number | null;
  rhGasGwei: number | null;
}

/** The chrome every screen shares: ticker tape, chain counts and the status bar. */
export interface LiveShell {
  tape: LiveTapeItem[];
  chainCounts: Record<LiveChainFilter, number>;
  status: LiveStatus;
  updatedAt: number;
}

/** At most this many tokens per /v1/prices or /v1/launches request (an alert list's worth). */
export const MAX_ALERT_IDS = 25;

/** One token's market now (/v1/prices): what price alerts check. */
export interface LivePrice {
  address: string;
  chain: ChainId;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCap: number;
  /** Price change in percent over the last hour and day. */
  change1h: number;
  change24h: number;
  /** When the market data arrived, ms. */
  at: number;
}

export interface LivePrices {
  prices: LivePrice[];
}

/** The launchpads whose launches the worker follows, and so the launchpads alerts can watch. */
export const ALERT_LAUNCHPADS = ["tonk", "pump", "bonk", "pons"] as const satisfies readonly LaunchpadId[];
export type AlertLaunchpad = (typeof ALERT_LAUNCHPADS)[number];

/** One launch as it stands (/v1/launches): what launchpad alerts compare between checks. */
export interface LiveLaunch {
  address: string;
  chain: ChainId;
  launchpad: LaunchpadId;
  symbol: string;
  name: string;
  /** ms since epoch. */
  launchedAt: number;
  graduatedAt: number | null;
  /** When the creator's lock ends, ms; null without a lock. */
  lockEnd: number | null;
  /** Locked tokens the creator has claimed so far, raw units as a decimal string; null without a lock. */
  lockClaimed: string | null;
  /** Launched within the hour and Hot now: Explore's flame (20 or more buys in 15 minutes). */
  hot: boolean;
}

export interface LiveLaunches {
  /** tonkfun.fun's newest launches, each followed launchpad's recent graduations and hot launches, then any asked for by address. */
  launches: LiveLaunch[];
}
