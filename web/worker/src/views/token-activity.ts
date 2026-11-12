/**
 * A token's trade book as the detail page's Live trades and Top traders
 * tables. Trades come from Helius (Solana tokens someone has open) or the
 * Pons curve (Robinhood Chain); USD figures use the price at each trade when
 * it was known, else the latest rate in the book.
 */
import type { TokenTrade, TopTrader, WalletTag } from "@/shared/types/token-detail";
import type { TrackedToken } from "../model";
import { NATIVE_ETH, WETH } from "../sources/pons";
import { type TradeBook, type TradeRecord, topTraders } from "../trades/book";

/** Trades the page lists. */
const SHOWN_TRADES = 50;

export interface ActivityContext {
  book: TradeBook | null;
  /** Whether a wallet counts as smart money. */
  isSmart: (wallet: string) => boolean;
}

const EXPLORER = {
  sol: (tx: string) => `https://solscan.io/tx/${tx}`,
  rh: (tx: string) => `https://robinhoodchain.blockscout.com/tx/${tx}`,
} as const;

/** USD per unit of the coin the book counts in: the newest trade that was priced, else the chain coin's price. */
function usdRate(book: TradeBook, token: TrackedToken, coinUsd: number | null): number | null {
  const priced = book.recent.find((t) => t.usd !== null && t.native > 0);
  if (priced?.usd != null) return priced.usd / priced.native;
  return token.pons ? null : coinUsd;
}

/** The trade's amount in the chain's own coin (SOL or ETH); a Pons curve quoted in another asset converts through USD. */
function coinAmount(trade: TradeRecord, token: TrackedToken, coinUsd: number | null): number | null {
  const quote = token.pons?.quote;
  if (!quote || quote === NATIVE_ETH || quote === WETH) return trade.native;
  return trade.usd !== null && coinUsd ? trade.usd / coinUsd : null;
}

function tagOf(wallet: string, token: TrackedToken, ctx: ActivityContext): WalletTag | null {
  if (ctx.isSmart(wallet)) return "smart";
  return token.pons?.earlyBuyers?.includes(wallet) ? "sniper" : null;
}

export function tradesView(token: TrackedToken, ctx: ActivityContext, coinUsd: number | null, now: number): TokenTrade[] {
  const book = ctx.book;
  if (!book) return [];
  const rate = usdRate(book, token, coinUsd);
  return book.recent.slice(0, SHOWN_TRADES).map((trade) => ({
    id: trade.id,
    ageSeconds: Math.max(0, Math.round((now - trade.at) / 1000)),
    side: trade.side,
    usd: trade.usd ?? (rate === null ? null : trade.native * rate),
    native: coinAmount(trade, token, coinUsd),
    tokens: trade.tokens,
    marketCap: trade.marketCap,
    trader: trade.wallet,
    tag: tagOf(trade.wallet, token, ctx),
    txUrl: EXPLORER[token.chain](trade.tx),
  }));
}

export function tradersView(token: TrackedToken, ctx: ActivityContext, coinUsd: number | null): TopTrader[] {
  const book = ctx.book;
  const rate = book ? usdRate(book, token, coinUsd) : null;
  if (!book || rate === null) return [];
  return topTraders(book).map((row) => ({
    address: row.wallet,
    tag: tagOf(row.wallet, token, ctx),
    pnlUsd: row.realised * rate,
    boughtUsd: row.bought * rate,
    soldUsd: row.sold * rate,
    winRate: row.winRate,
  }));
}
