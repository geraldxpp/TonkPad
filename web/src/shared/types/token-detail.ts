import type { Token } from "./token";

/** The chart toolbar's timeframes. */
export const CHART_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

/** One candle of market cap in USD (the Price view divides by supply). */
export interface Candle {
  /** Unix seconds at the candle's open. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** In the chain's coin (ETH or SOL). */
  volume: number;
}

/** A notable buy pinned under its candle: W for a whale, S for a smart wallet. */
export interface ChartMark {
  time: number;
  kind: "smart" | "whale";
}

/** The newest smart-wallet buy, called out on the last candle. */
export interface ChartCallout {
  /** Shortened address. */
  trader: string;
  /** Spent, in the chain's coin. */
  native: number;
  /** 0–1. */
  winRate: number;
}

export interface TokenChart {
  /** False when history contains observed market-cap samples without trade volume. */
  volumeAvailable?: boolean;
  candles: Record<ChartTimeframe, Candle[]>;
  marks: Record<ChartTimeframe, ChartMark[]>;
  callout: ChartCallout | null;
  /** Market cap at which the token graduates; null once it has. */
  graduationCap: number | null;
}

export type WalletTag = "smart" | "sniper" | "whale" | "devLock" | "curve";

export interface TokenTrade {
  id: string;
  /** Seconds before `TokenDetail.updatedAt` (mock) or before the response (live). */
  ageSeconds: number;
  side: "buy" | "sell";
  /** Null when no price was known for it (live). */
  usd: number | null;
  /** In the chain's coin; null when it can't be told (a Pons curve quoted in another asset, unpriced). */
  native: number | null;
  tokens: number;
  /** Market cap just after the trade; null when unknown (live). */
  marketCap: number | null;
  /** The wallet's address: shortened in mock data, full in live data (the table shortens it). */
  trader: string;
  tag: WalletTag | null;
  txUrl: string | null;
}

export interface TokenHolder {
  /** Shortened address, or null for the bonding curve. */
  address: string | null;
  tag: WalletTag | null;
  /** Share of supply, 0–1. */
  share: number;
  tokens: number;
  /** Crew rewards earned in USD; null for holders that aren't paid (the curve, a lock). */
  crewEarned: number | null;
}

export interface TopTrader {
  address: string;
  tag: WalletTag | null;
  pnlUsd: number;
  boughtUsd: number;
  soldUsd: number;
  /** 0–1: the share of the wallet's sells that beat its average buy (live); null before it has sold. */
  winRate: number | null;
}

/** The creator's locked allocation, read from its lock contract. */
export interface DevLock {
  /** Share of the dev allocation locked, 0–1. */
  share: number;
  vestDays: number;
  unlocks: number;
  /** ms */
  startedAt: number;
  elapsedDays: number;
  nextUnlockDays: number;
  /** Shortened lock contract address. */
  contract: string;
  contractUrl: string | null;
}

/** Tonkpad launches pay their crew (holders) a share of every trade. */
export interface CrewRewards {
  paidUsd: number;
  sharePct: number;
  lastPayoutSeconds: number;
  /** USD paid per day over the last 14 days, oldest first. */
  daily: number[];
}

/** Everything the token screen shows. Mock and live data share this shape. */
export interface TokenDetail {
  /** Omitted for the design fixtures. Live views never fill gaps with mock facts. */
  source?: "live";
  /** False until a market feed has priced the token. */
  marketAvailable?: boolean;
  token: Token;
  /** Full contract address (the header shortens it; Copy copies all of it). */
  contract: string;
  /** ms */
  launchedAt: number;
  priceUsd: number | null;
  supply: number | null;
  description: string | null;
  links: { website: string | null; community: string | null };
  stats: {
    txns24h: number | null;
    /** In the chain's coin. */
    liquidity: number | null;
    liquidityIn: "curve" | "pool";
    holdersChange1h: number | null;
    /** Share of supply the 10 largest wallets hold, 0–1. */
    top10Share: number | null;
  };
  chart: TokenChart;
  flow1h: { buys: number; sells: number } | null;
  trades: TokenTrade[];
  holders: TokenHolder[];
  topTraders: TopTrader[];
  /** Shortened curve address, while there is one. */
  curve: string | null;
  feePct: number | null;
  devLock: DevLock | null;
  crew: CrewRewards | null;
  /** The token's mission agent, if it has one. */
  agent: { name: string } | null;
  /** The chain coin's USD price, for the trade panel. */
  nativeUsd: number | null;
  /** ms; the time the data describes. */
  updatedAt: number;
}
