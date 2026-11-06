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
