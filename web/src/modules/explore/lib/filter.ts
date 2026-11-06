import type { Token } from "@/shared/types/token";
import type { ExploreView } from "./view";

export interface RankedToken extends Token {
  /** Position in the filtered list, starting at 1. */
  rank: number;
}

/**
 * The reference's filter logic: chain AND launchpad AND search AND tab, then
 * ranks restart at 1. Gainers sorts by 24h change instead of filtering.
 */
export function filterTokens(tokens: readonly Token[], view: Omit<ExploreView, "tf">): RankedToken[] {
  let rows = tokens.slice();
  if (view.chain !== "all") rows = rows.filter((t) => t.chain === view.chain);
  if (view.pad !== "all") rows = rows.filter((t) => t.launchpad === view.pad);

  const q = view.q.trim().toLowerCase();
  if (q) rows = rows.filter((t) => `${t.name} ${t.ticker}`.toLowerCase().includes(q));

  switch (view.tab) {
    case "new":
      // New flag, or an age still counted in minutes.
      rows = rows.filter((t) => t.flags.isNew || t.ageMinutes < 60);
      break;
    case "graduating":
      rows = rows.filter((t) => t.curve < 1 && t.curve >= 0.5);
      break;
    case "graduated":
      rows = rows.filter((t) => t.curve >= 1);
      break;
    case "gainers":
      rows = rows.sort((a, b) => b.change24h - a.change24h);
      break;
    case "smart":
      rows = rows.filter((t) => t.smartWallets > 0);
      break;
    case "locked":
      rows = rows.filter((t) => t.flags.locked);
      break;
    case "trending":
      break;
  }

  return rows.map((token, index) => ({ ...token, rank: index + 1 }));
}
