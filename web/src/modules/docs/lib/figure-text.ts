import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { formatUsd, formatUsdCompact } from "@/shared/lib/format";
import { formatEth, formatEthShort, formatTokensFull } from "@/shared/tonk/format";
import { usdValue } from "./figures";
import type { DocsLiveValue } from "./live";

/** One live figure the page can show. */
export type FigureKey = "fee" | "reserves" | "startCap" | "graduation" | "status" | "reserveNow" | "maxCurve";

export interface FigureText {
  key: FigureKey;
  label: string;
  value: string;
  /** A second line, such as the market cap at graduation. */
  detail: string | null;
  /** The dollar value at the live ETH price, or why there is none; null where the site doesn't count in dollars. */
  usd: string | null;
}

type FigureMessages = Dictionary["docs"]["figures"];

/** How a dollar value reads: "≈ $15.00", "Dollar value unavailable", or nothing at all. */
function dollars(f: FigureMessages, live: DocsLiveValue, wei: bigint, compact: boolean): string | null {
  if (live.usd === "off" || live.usd === "pending") return null;
  const value = usdValue(wei, live.usd === "unavailable" ? null : live.usd);
  if (value === null) return f.usdUnavailable;
  return fmt(f.usd, { usd: compact ? formatUsdCompact(value) : formatUsd(value) });
}

/**
 * The words for a live figure: its value from the launchpad's settings, in
 * the site's unit and, on mainnet, in dollars too. Without settings it says
 * the figure is being read, or that it is unavailable; it never makes one up.
 */
export function figureText(key: FigureKey, live: DocsLiveValue, f: FigureMessages): FigureText {
  const label = f[key];
  const figures = live.figures;
  if (!figures) return { key, label, value: live.pending ? f.loading : f.unavailable, detail: null, usd: null };
  const exact = (wei: bigint) => `${formatEth(wei)} ${live.unit}`;
  const about = (wei: bigint) => `${formatEthShort(wei)} ${live.unit}`;
  switch (key) {
    case "fee":
      return { key, label, value: exact(figures.launchFee), detail: null, usd: dollars(f, live, figures.launchFee, false) };
    case "reserves":
      return { key, label, value: fmt(f.reservesValue, { eth: exact(figures.virtualEth), tokens: formatTokensFull(figures.virtualTokens) }), detail: null, usd: null };
    case "startCap":
      return { key, label, value: about(figures.startCap), detail: null, usd: dollars(f, live, figures.startCap, true) };
    case "graduation":
      return { key, label, value: fmt(f.graduationValue, { eth: about(figures.target) }), detail: fmt(f.graduationCap, { cap: about(figures.graduationCap) }), usd: dollars(f, live, figures.graduationCap, true) };
    case "status":
      return { key, label, value: figures.paused ? f.paused : f.open, detail: null, usd: null };
    case "reserveNow":
      return { key, label, value: exact(figures.virtualEth), detail: null, usd: null };
    case "maxCurve":
      return { key, label, value: fmt(f.maxCurveValue, { eth: about(figures.target) }), detail: null, usd: dollars(f, live, figures.target, true) };
  }
}

/** The line under the figures: where they come from. */
export function sourceText(live: DocsLiveValue, f: FigureMessages): string {
  if (live.source === "demo") return f.demo;
  if (live.source === "none") return f.none;
  return fmt(f.live, { chain: live.chainName ?? "" });
}
