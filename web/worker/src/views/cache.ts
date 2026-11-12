import type { LaunchpadId } from "@/shared/types/launchpad";
import type { LiveList, LiveListQuery, LiveOverview, LiveShell, LiveStatus } from "@/shared/types/live";
import type { TokenDetail } from "@/shared/types/token-detail";
import type { ChartBook } from "../charts/book";
import type { TokenStore } from "../store";
import { launchesView, pricesView } from "./alerts";
import { listView } from "./list";
import { overviewView } from "./overview";
import { shellView } from "./shell";
import type { SystemAddresses } from "../tonk/holders";
import type { TradeBook } from "../trades/book";
import { findTrackedToken, tokenView } from "./token";

/** Where a token page's trades come from, and who counts as smart money. */
export interface ActivitySources {
  /** Helius trade books for Solana tokens people have open. */
  tradesOf: (address: string) => TradeBook | null;
  isSmart: (wallet: string) => boolean;
}

/** What token pages draw on besides the store (main.ts; tests and fixtures leave out what they don't need). */
export interface ViewOptions extends Partial<ActivitySources> {
  /** Fetches trade candles for the pools of open tokens. */
  charts?: ChartBook;
  /** A Pons quote asset's USD price now, tokenized stocks included. */
  quoteUsd?: (quote: string) => number | null;
  /** tonkfun.fun's launchpad, migrator and PoolManager, when the worker follows it. */
  tonk?: SystemAddresses;
}

/** How long a page's first request waits for a token's first GeckoTerminal candles. */
const FIRST_CANDLES_WAIT = 2_000;

function memo<T>(compute: () => T): () => T {
  let at = 0;
  let value: T | null = null;
  return () => {
    const now = Date.now();
    if (value === null || now - at >= 1_000) {
      value = compute();
      at = now;
    }
    return value;
  };
}

/** The views the server answers with, recomputed at most once a second (the app caches them for 2 s on top). */
export function createViews(store: TokenStore, status: LiveStatus, ingesting: readonly LaunchpadId[], options: ViewOptions = {}) {
  const overview = memo<LiveOverview>(() => overviewView(store.all(), ingesting, Date.now()));
  const shell = memo<LiveShell>(() => shellView(store.all(), { ...status }, Date.now()));
  const lists = new Map<string, { at: number; value: LiveList }>();
  const selected = new Map<string, number>();

  async function token(address: string): Promise<TokenDetail | null> {
    const found = findTrackedToken(store.all(), address);
    if (!found) return null;
    selected.set(found.address, Date.now());
    const oldest = selected.keys().next().value;
    if (selected.size > 500 && oldest) selected.delete(oldest);
    const { charts, quoteUsd, tradesOf, tonk, isSmart = () => false } = options;
    await charts?.open(found, FIRST_CANDLES_WAIT);
    const book = found.pons?.book ?? tradesOf?.(found.address) ?? null;
    return tokenView(found, status, Date.now(), { activity: { book, isSmart }, charts: { pools: charts, quoteUsd }, tonk });
  }

  function list(query: LiveListQuery): LiveList {
    const key = JSON.stringify(query);
    const now = Date.now();
    const hit = lists.get(key);
    if (hit && now - hit.at < 1_000) return hit.value;
    const value = listView(store.all(), query, now);
    lists.set(key, { at: now, value });
    if (lists.size > 500) lists.clear();
    return value;
  }

  /** Tokens someone has open on their detail page (asked for in the last minute). */
  function openedAddresses(): Set<string> {
    const open = new Set<string>();
    for (const [address, at] of selected) {
      if (Date.now() - at <= 60_000) open.add(address);
      else selected.delete(address);
    }
    return open;
  }

  /** Tokens someone is likely to see, so their art loads first. */
  function visibleAddresses(): Set<string> {
    const seen = openedAddresses();
    const base = { chain: "all", pad: "all", q: "", limit: 30 } as const;
    for (const tab of ["trending", "new", "graduating", "graduated", "gainers"] as const) {
      for (const row of list({ ...base, tab, tf: "24h" }).rows) seen.add(row.address);
    }
    const o = overview();
    o.heating.forEach((c) => seen.add(c.token.address));
    o.blips.forEach((b) => seen.add(b.address));
    if (o.missionPick) seen.add(o.missionPick.token.address);
    shell().tape.forEach((t) => seen.add(t.address));
    return seen;
  }

  /** For alerts: neither marks a token opened, so neither spends Helius credits. */
  const prices = (ids: string[]) => pricesView(store, ids);
  const launches = (ids: string[]) => launchesView(store, ids, Date.now());

  return { overview, shell, list, token, prices, launches, visibleAddresses, openedAddresses };
}
