import { readWatchlist } from "@/shared/lib/watchlist";
import { type LiveLaunch, type LivePrice, MAX_ALERT_IDS } from "@/shared/types/live";
import { checkRule, diffLaunches, type FeedDraft } from "./check";
import { newId, readFeed, readRules, readSeen, readSettings, writeFeed, writeRules, writeSeen } from "./storage";
import type { FeedItem } from "./types";

export interface CheckDeps {
  fetchPrices: (ids: readonly string[]) => Promise<LivePrice[]>;
  /** Null where tonkfun.fun's launchpad isn't followed. */
  fetchLaunches: ((ids: readonly string[]) => Promise<LiveLaunch[]>) | null;
  now: () => number;
}

/** EVM addresses match in any case; Solana's are case-sensitive. */
const key = (address: string) => (address.startsWith("0x") ? address.toLowerCase() : address);

/**
 * One round of checks: the visitor's rules against the market now, then
 * tonkfun.fun's launchpad. What fires goes into the feed (newest first) and
 * is returned, for the toast and a notification. Rules are read again before
 * writing, so one deleted meanwhile stays deleted.
 */
export async function runCheck(deps: CheckDeps): Promise<FeedItem[]> {
  const drafts: FeedDraft[] = [];
  const rules = readRules().filter((rule) => rule.on);
  if (rules.length > 0) {
    const ids = [...new Set(rules.map((rule) => rule.token.address))].slice(0, MAX_ALERT_IDS);
    const quotes = new Map((await deps.fetchPrices(ids)).map((price) => [key(price.address), price]));
    const armed = new Map<string, boolean>();
    for (const rule of rules) {
      const quote = quotes.get(key(rule.token.address));
      if (!quote) continue;
      const result = checkRule(rule, quote);
      if (result.fired) drafts.push(result.fired);
      if (result.armed !== rule.armed) armed.set(rule.id, result.armed);
    }
    if (armed.size > 0) writeRules(readRules().map((rule) => ({ ...rule, armed: armed.get(rule.id) ?? rule.armed })));
  }
  const settings = readSettings();
  if (deps.fetchLaunches && (settings.launches || settings.graduations || settings.locks)) {
    const watched = readWatchlist().filter((address) => address.startsWith("0x")).slice(0, MAX_ALERT_IDS);
    const result = diffLaunches(readSeen(), await deps.fetchLaunches(watched), settings, watched, deps.now());
    drafts.push(...result.drafts);
    writeSeen(result.seen);
  }
  if (drafts.length === 0) return [];
  const at = deps.now();
  const items = drafts.map((draft) => ({ ...draft, id: newId(), at, read: false }));
  writeFeed([...items, ...readFeed()]);
  return items;
}
