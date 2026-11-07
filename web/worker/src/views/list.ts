import type { LiveList, LiveListQuery } from "@/shared/types/live";
import type { TrackedToken } from "../model";
import { isLockedMission, lockedShare } from "../locks";
import { buysLast15m, toToken, windowFor } from "../tokens";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const MAX_LIMIT = 50;
/** Buys in 15 minutes that earn the Hot flame. */
export const HOT_BUYS = 20;
/** Trending, Gainers and Heating up skip dust under this market cap (a fresh launch starts near $2.5K). */
export const MIN_LISTED_MCAP = 4_000;

/** Tokens launched in the last 24 hours (the footer's total). */
export function launchedToday(tokens: readonly TrackedToken[], now: number): TrackedToken[] {
  return tokens.filter((t) => now - t.createdAt <= DAY);
}

function matchesQuery(t: TrackedToken, q: string): boolean {
  if (!q) return true;
  if (q.length >= 32) return t.address === q;
  const needle = q.toLowerCase();
  return t.name.toLowerCase().includes(needle) || t.symbol.toLowerCase().includes(needle);
}

/** The rows for one view of the token list: filtered, sorted and paged. */
export function listView(tokens: readonly TrackedToken[], query: LiveListQuery, now: number): LiveList {
  const q = query.q.trim();
  let rows = tokens.filter(
    (t) =>
      (query.chain === "all" || t.chain === query.chain) &&
      (query.pad === "all" || t.launchpad === query.pad) &&
      matchesQuery(t, q),
  );
  const vol = (t: TrackedToken) => windowFor(t, query.tf).volume;

  switch (query.tab) {
    case "trending":
      rows = rows
        .filter((t) => t.marketAt > 0 && t.marketCap >= MIN_LISTED_MCAP && vol(t) > 0)
        .sort((a, b) => vol(b) - vol(a));
      break;
    case "new":
      rows = rows.filter((t) => now - t.createdAt < 60 * MINUTE).sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "graduating":
      rows = rows.filter((t) => !t.graduated && t.curve >= 0.5).sort((a, b) => b.curve - a.curve);
      break;
    case "graduated":
      rows = rows
        .filter((t) => t.graduated && now - (t.graduatedAt ?? t.createdAt) <= DAY)
        .sort((a, b) => (b.graduatedAt ?? b.createdAt) - (a.graduatedAt ?? a.createdAt));
      break;
    case "gainers":
      rows = rows
        .filter((t) => t.marketAt > 0 && t.marketCap >= MIN_LISTED_MCAP && vol(t) >= 500)
        .sort((a, b) => windowFor(b, query.tf).change - windowFor(a, query.tf).change);
      break;
    case "smart": {
      const smart = (t: TrackedToken) => t.smartCount ?? 0;
      rows = rows
        .filter((t) => smart(t) > 0 && t.marketAt > 0 && t.marketCap >= MIN_LISTED_MCAP)
        .sort((a, b) => smart(b) - smart(a) || vol(b) - vol(a));
      break;
    }
    case "locked":
      // Tonkpad launches with a lock, the biggest share of supply first (empty until Tonkpad launches).
      rows = rows
        .filter((t) => isLockedMission(t, now))
        .sort((a, b) => lockedShare(b, now) - lockedShare(a, now) || b.marketCap - a.marketCap);
      break;
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit)));
  return {
    rows: rows.slice(0, limit).map((t) => toToken(t, now, buysLast15m(t, now) >= HOT_BUYS)),
    matched: rows.length,
    total: launchedToday(tokens, now).length,
    updatedAt: now,
  };
}
