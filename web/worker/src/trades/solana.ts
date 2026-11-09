/**
 * Live trades for the Solana tokens people have open (their detail pages),
 * from Helius. A token's first fetch takes its last 300 transactions; after
 * that only newer ones, every 30 seconds while it stays open. A daily credit
 * cap stops the fetching until the next UTC day, so a busy day can't run the
 * Helius plan dry; pages keep the trades they already have.
 */
import { fetchMintTrades } from "../sources/helius-trades";
import type { TokenStore } from "../store";
import { newTradeBook, recordTrades, type TradeBook } from "./book";

export const TRADES_EVERY = 30_000;
/** Books of tokens nobody has had open for this long are dropped. */
export const KEEP_FOR = 30 * 60_000;
const FIRST_PAGE = 300;
const NEXT_PAGE = 100;
/** Tokens fetched per round, so one round stays short. */
const PER_ROUND = 4;

interface Feed {
  book: TradeBook;
  slot: number | null;
  fetchedAt: number;
  openedAt: number;
}

export interface SolanaTradeDeps {
  store: TokenStore;
  apiKey: string | null;
  opened: () => ReadonlySet<string>;
  solUsd: () => number | null;
  /** Credits allowed per UTC day. */
  dailyCredits: number;
  onCredits: (credits: number) => void;
  fail: (scope: string, error: unknown) => void;
}

const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

export function createSolanaTrades(deps: SolanaTradeDeps) {
  const feeds = new Map<string, Feed>();
  let day = dayOf(Date.now());
  let spent = 0;

  /** Open Solana tokens whose trades are due, never fetched first, then the stalest. */
  function due(now: number): string[] {
    const out: Array<{ address: string; fetchedAt: number }> = [];
    for (const address of deps.opened()) {
      const token = deps.store.get(address);
      if (token?.chain !== "sol") continue;
      const feed = feeds.get(address);
      if (feed && now - feed.fetchedAt < TRADES_EVERY) continue;
      out.push({ address, fetchedAt: feed?.fetchedAt ?? 0 });
    }
    return out.sort((a, b) => a.fetchedAt - b.fetchedAt).slice(0, PER_ROUND).map((d) => d.address);
  }

  async function refresh(): Promise<void> {
    const now = Date.now();
    if (dayOf(now) !== day) {
      day = dayOf(now);
      spent = 0;
    }
    for (const [address, feed] of feeds) if (now - feed.openedAt > KEEP_FOR) feeds.delete(address);
    if (!deps.apiKey) return;
    for (const address of deps.opened()) {
      const feed = feeds.get(address);
      if (feed) feed.openedAt = now;
    }
    for (const address of due(now)) {
      // A first fetch costs up to 30 credits, a later one 10.
      if (spent + (feeds.has(address) ? 10 : 30) > deps.dailyCredits) return;
      const feed = feeds.get(address) ?? { book: newTradeBook(), slot: null, fetchedAt: 0, openedAt: now };
      feeds.set(address, feed);
      feed.fetchedAt = now;
      try {
        const page = await fetchMintTrades(deps.apiKey, address, feed.slot, feed.slot === null ? FIRST_PAGE : NEXT_PAGE, deps.solUsd());
        spent += page.credits;
        deps.onCredits(page.credits);
        const supply = supplyOf(deps.store, address);
        recordTrades(feed.book, page.trades.map((t) => ({ ...t, marketCap: t.usd !== null && supply !== null ? (t.usd / t.tokens) * supply : null })));
        feed.slot = page.slot;
      } catch (error) {
        deps.fail("trades", error);
      }
    }
  }

  return {
    refresh,
    /** The token's trade book, once its trades have been fetched. */
    bookOf: (address: string): TradeBook | null => feeds.get(address)?.book ?? null,
    usage: () => ({ creditsToday: spent, dailyCredits: deps.dailyCredits, tokens: feeds.size }),
  };
}

/** Whole-token supply, for market cap at each trade. */
function supplyOf(store: TokenStore, address: string): number | null {
  const token = store.get(address);
  if (!token?.supply || token.decimals == null) return null;
  const whole = token.supply / 10 ** token.decimals;
  return Number.isFinite(whole) && whole > 0 ? whole : null;
}
