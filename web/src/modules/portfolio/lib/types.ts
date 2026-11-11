import type { ChainId } from "@/shared/types/chain";

/** A token's percent move over each window; null where the market data doesn't say. */
export interface PriceChange {
  m5: number | null;
  h1: number | null;
  h6: number | null;
  h24: number | null;
}

export const NO_CHANGE: PriceChange = { m5: null, h1: null, h6: null, h24: null };

/** The two coins with a full price history, for the portfolio chart. */
export type TrackedCoin = "SOL" | "ETH";

/** One thing a wallet holds on one chain. */
export interface PortfolioAsset {
  chain: ChainId;
  /** The mint or contract; a chain's coin uses the swap engine's placeholder. */
  address: string;
  /** Short and safe to show: text from a token's metadata is untrusted, and is cleaned on the server. */
  symbol: string;
  name: string;
  /** A trusted image URL, or "" for the letter tile. */
  art: string;
  decimals: number;
  /** The balance in base units, as a decimal string. */
  raw: string;
  /** The same balance for display and sums. */
  balance: number;
  /** Null when the market data gives no reliable price: the asset then counts for nothing in the totals. */
  priceUsd: number | null;
  valueUsd: number | null;
  change: PriceChange;
  /** The chain's own coin. */
  native: boolean;
  stable: boolean;
  /** Priced over time by this coin's candles (the coin itself, or its wrapped form). */
  track: TrackedCoin | null;
}

/** What /api/portfolio/[chain]/[owner] returns: everything one wallet holds on one chain. */
export interface ChainPortfolio {
  chain: ChainId;
  owner: string;
  /** Priced assets, and at most a page of the unpriced ones. */
  assets: PortfolioAsset[];
  /** How many tokens have no reliable price, shown or not. */
  unpriced: number;
  /** Something couldn't be read: some tokens or prices are missing from this answer. */
  partial: boolean;
  /** ms */
  readAt: number;
}

export type ActivityType = "swap" | "receive" | "send";

/** One side of a transaction: what moved, from the wallet's point of view. */
export interface ActivityLeg {
  symbol: string;
  amount: number;
}

export interface PortfolioActivity {
  /** The transaction's hash or signature. */
  id: string;
  chain: ChainId;
  type: ActivityType;
  /** ms */
  time: number;
  /** It failed on-chain: nothing moved but the network fee. */
  failed: boolean;
  received: ActivityLeg[];
  sent: ActivityLeg[];
  /** Who the coins went to or came from, on a send or a receive. */
  counterparty: string | null;
  url: string;
}

/** What /api/portfolio/[chain]/[owner]/activity returns: a page of a wallet's moves, newest first. */
export interface ActivityPage {
  chain: ChainId;
  owner: string;
  items: PortfolioActivity[];
  /** Pass back as `?cursor=` for the next page; null at the end. */
  next: string | null;
}

export const RANGES = ["1D", "1W", "1M", "1Y"] as const;
export type PortfolioRange = (typeof RANGES)[number];

/** A moment (ms) and a USD price. */
export type PricePoint = [number, number];

/** What /api/portfolio/market returns: real candles for the two tracked coins. Null where they couldn't be read. */
export interface MarketSeries {
  range: PortfolioRange;
  SOL: PricePoint[] | null;
  ETH: PricePoint[] | null;
}
