/**
 * One token's trade book, for its detail page: the latest trades, and each
 * wallet's totals since the book began, which rank the top traders. Amounts
 * are in the coin the token trades against (SOL on Solana, the curve's quote
 * asset on Pons, usually ETH), so a wallet's buys and sells compare in one unit.
 */

export interface TradeRecord {
  /** Unique per trade. */
  id: string;
  /** Transaction signature (Solana) or hash (Robinhood Chain). */
  tx: string;
  /** ms */
  at: number;
  side: "buy" | "sell";
  /** The wallet that bought or sold. */
  wallet: string;
  /** Whole tokens. */
  tokens: number;
  /** Paid in (buys) or received (sells), in the coin the token trades against. */
  native: number;
  /** USD at the time, when the coin's price was known. */
  usd: number | null;
  /** Market cap in USD just after the trade, when known. */
  marketCap: number | null;
}

/** One wallet's totals. A sell is a win when it got more per token than the wallet's average buy. */
export interface WalletFlow {
  bought: number;
  sold: number;
  boughtTokens: number;
  soldTokens: number;
  sells: number;
  wins: number;
}

export interface TradeBook {
  /** Newest first. */
  recent: TradeRecord[];
  flows: Record<string, WalletFlow>;
  /**
   * When the oldest trade the book has taken in was made, ms: the flows only
   * know trades from then on (absent in older snapshots).
   */
  since?: number | null;
}

export const RECENT_TRADES = 100;
/** Wallets kept per book; past this the least active are dropped. */
export const MAX_WALLETS = 2_000;

export const newTradeBook = (): TradeBook => ({ recent: [], flows: {}, since: null });

function apply(flows: Record<string, WalletFlow>, trade: TradeRecord): void {
  const flow = (flows[trade.wallet] ??= { bought: 0, sold: 0, boughtTokens: 0, soldTokens: 0, sells: 0, wins: 0 });
  if (trade.side === "buy") {
    flow.bought += trade.native;
    flow.boughtTokens += trade.tokens;
    return;
  }
  if (flow.boughtTokens > 0 && trade.tokens > 0) {
    flow.sells += 1;
    if (trade.native / trade.tokens > flow.bought / flow.boughtTokens) flow.wins += 1;
  }
  flow.sold += trade.native;
  flow.soldTokens += trade.tokens;
}

function prune(flows: Record<string, WalletFlow>): void {
  const wallets = Object.keys(flows);
  if (wallets.length <= MAX_WALLETS) return;
  const volume = (w: string) => flows[w].bought + flows[w].sold;
  for (const wallet of wallets.sort((a, b) => volume(a) - volume(b)).slice(0, wallets.length - MAX_WALLETS)) delete flows[wallet];
}

/** Adds trades it hasn't seen (by id), oldest first so wins compare against earlier buys; returns how many were new. */
export function recordTrades(book: TradeBook, trades: readonly TradeRecord[]): number {
  const seen = new Set(book.recent.map((trade) => trade.id));
  const fresh = trades.filter((trade) => !seen.has(trade.id) && trade.tokens > 0 && trade.native >= 0).sort((a, b) => a.at - b.at);
  for (const trade of fresh) {
    seen.add(trade.id);
    apply(book.flows, trade);
  }
  if (fresh.length === 0) return 0;
  book.since = Math.min(book.since ?? Number.POSITIVE_INFINITY, fresh[0].at);
  book.recent = [...fresh.reverse(), ...book.recent].sort((a, b) => b.at - a.at).slice(0, RECENT_TRADES);
  prune(book.flows);
  return fresh.length;
}

export interface TraderRow {
  wallet: string;
  /** In the traded coin. */
  bought: number;
  sold: number;
  /** Realised profit, in the traded coin: see realisedProfit. */
  realised: number;
  /** Share of the wallet's sells that beat its average buy; null before it has sold. */
  winRate: number | null;
}

/**
 * Realised profit on the tokens a wallet both bought and sold in the book:
 * what those sells got, less what those tokens cost at its average buy. A
 * book may begin after a wallet's first buys (Solana books start when a page
 * is opened), so tokens it sold beyond what it bought here have no known cost
 * and count for nothing, and tokens it still holds aren't counted either.
 */
export function realisedProfit(flow: WalletFlow): number {
  const matched = Math.min(flow.boughtTokens, flow.soldTokens);
  if (matched <= 0) return 0;
  return flow.sold * (matched / flow.soldTokens) - flow.bought * (matched / flow.boughtTokens);
}

/**
 * The most profitable wallets, best first: only wallets with both buys and
 * sells in the book rank, since a sell with no buy on record says nothing
 * about profit. Ties go to the bigger buyer, then by address, so the order
 * holds still between refreshes.
 */
export function topTraders(book: TradeBook, limit = 10): TraderRow[] {
  return Object.entries(book.flows)
    .filter(([, flow]) => flow.boughtTokens > 0 && flow.soldTokens > 0)
    .map(([wallet, flow]) => ({ wallet, bought: flow.bought, sold: flow.sold, realised: realisedProfit(flow), winRate: flow.sells > 0 ? flow.wins / flow.sells : null }))
    .sort((a, b) => b.realised - a.realised || b.bought - a.bought || (a.wallet < b.wallet ? -1 : 1))
    .slice(0, limit);
}
