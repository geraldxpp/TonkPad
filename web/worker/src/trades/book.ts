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
  /** Tokens seen bought and not yet sold, and what they cost (absent in older snapshots). */
  open?: number;
  openCost?: number;
  /** Realised profit so far on sells of tokens it was seen buying first, and how many tokens those sells covered. */
  realised?: number;
  matched?: number;
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

/** An older snapshot's flow kept only totals: start its running position from what they imply. */
function positionOf(flow: WalletFlow): { open: number; openCost: number; realised: number; matched: number } {
  if (flow.open !== undefined) return { open: flow.open, openCost: flow.openCost ?? 0, realised: flow.realised ?? 0, matched: flow.matched ?? 0 };
  const matched = Math.min(flow.boughtTokens, flow.soldTokens);
  const open = flow.boughtTokens - matched;
  return { open, openCost: flow.boughtTokens > 0 ? flow.bought * (open / flow.boughtTokens) : 0, realised: realisedProfit(flow), matched };
}

/**
 * Adds one trade to its wallet, in time order. A sell counts towards realised
 * profit only for tokens the wallet was seen buying before it, at their
 * average cost; selling first (tokens bought before the book began) says
 * nothing about profit, so it doesn't count.
 */
function apply(flows: Record<string, WalletFlow>, trade: TradeRecord): void {
  const flow = (flows[trade.wallet] ??= { bought: 0, sold: 0, boughtTokens: 0, soldTokens: 0, sells: 0, wins: 0, open: 0, openCost: 0, realised: 0, matched: 0 });
  const position = positionOf(flow);
  if (trade.side === "buy") {
    flow.bought += trade.native;
    flow.boughtTokens += trade.tokens;
    Object.assign(flow, { ...position, open: position.open + trade.tokens, openCost: position.openCost + trade.native });
    return;
  }
  if (flow.boughtTokens > 0 && trade.tokens > 0) {
    flow.sells += 1;
    if (trade.native / trade.tokens > flow.bought / flow.boughtTokens) flow.wins += 1;
  }
  const covered = Math.min(trade.tokens, position.open);
  if (covered > 0) {
    const cost = position.openCost * (covered / position.open);
    position.realised += trade.native * (covered / trade.tokens) - cost;
    position.openCost -= cost;
    position.open -= covered;
    position.matched += covered;
  }
  Object.assign(flow, position);
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
 * Realised profit from a flow's totals alone (what an older snapshot kept):
 * the sells' proceeds for as many tokens as it bought, less those tokens'
 * average cost. Newer flows track it trade by trade (see apply).
 */
export function realisedProfit(flow: WalletFlow): number {
  const matched = Math.min(flow.boughtTokens, flow.soldTokens);
  if (matched <= 0) return 0;
  return flow.sold * (matched / flow.soldTokens) - flow.bought * (matched / flow.boughtTokens);
}

/**
 * The most profitable wallets, best first: only wallets that sold tokens
 * they were seen buying rank, since a sell with no buy before it says nothing
 * about profit. Ties go to the bigger buyer, then by address, so the order
 * holds still between refreshes.
 */
export function topTraders(book: TradeBook, limit = 10): TraderRow[] {
  return Object.entries(book.flows)
    .map(([wallet, flow]) => ({ wallet, flow, position: positionOf(flow) }))
    .filter(({ position }) => position.matched > 0)
    .map(({ wallet, flow, position }) => ({ wallet, bought: flow.bought, sold: flow.sold, realised: position.realised, winRate: flow.sells > 0 ? flow.wins / flow.sells : null }))
    .sort((a, b) => b.realised - a.realised || b.bought - a.bought || (a.wallet < b.wallet ? -1 : 1))
    .slice(0, limit);
}
