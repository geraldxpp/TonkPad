import { isChainId } from "@/shared/config/chains";
import type { ChainId } from "@/shared/types/chain";
import { type ActivityType, type PortfolioActivity, type PortfolioAsset, type PortfolioRange, RANGES } from "./types";

export const TABS = ["assets", "activity"] as const;
export const SORTS = ["value", "change", "name"] as const;
export const ACTIVITY_FILTERS = ["all", "swap", "receive", "send"] as const;
/** Positions under this are dust, for "Hide under $5". */
export const SMALL_USD = 5;

export type PortfolioTab = (typeof TABS)[number];
export type AssetSort = (typeof SORTS)[number];
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
export type ChainView = "all" | ChainId;

/** The screen's view state; it all lives in the URL, so any view can be shared. */
export interface PortfolioView {
  chain: ChainView;
  range: PortfolioRange;
  tab: PortfolioTab;
  q: string;
  sort: AssetSort;
  small: boolean;
  type: ActivityFilter;
}

const pick = <T extends string>(options: readonly T[], raw: string | null, fallback: T): T => options.find((option) => option === raw) ?? fallback;

export function parseView(params: Pick<URLSearchParams, "get">): PortfolioView {
  const chain = params.get("chain");
  return {
    chain: isChainId(chain) ? chain : "all",
    range: pick(RANGES, params.get("range"), "1D"),
    tab: pick(TABS, params.get("tab"), "assets"),
    q: params.get("q") ?? "",
    sort: pick(SORTS, params.get("sort"), "value"),
    small: params.get("small") === "hide",
    type: pick(ACTIVITY_FILTERS, params.get("type"), "all"),
  };
}

/** A coin and its wrapped form share an address on Solana. */
export const assetKey = (asset: Pick<PortfolioAsset, "chain" | "address" | "native">) => `${asset.chain}:${asset.address}:${asset.native ? "coin" : "token"}`;

export const inChain = <T extends { chain: ChainId }>(items: readonly T[], chain: ChainView) => (chain === "all" ? [...items] : items.filter((item) => item.chain === chain));

export const isPriced = (asset: PortfolioAsset) => asset.priceUsd !== null;

export interface PortfolioTotals {
  total: number;
  /** Priced positions: tokens with no market don't count as assets held. */
  assets: number;
  networks: number;
  stablecoins: number;
}

export function totalsOf(assets: readonly PortfolioAsset[]): PortfolioTotals {
  const priced = assets.filter(isPriced);
  return {
    total: priced.reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0),
    assets: priced.length,
    networks: new Set(priced.map((asset) => asset.chain)).size,
    stablecoins: priced.filter((asset) => asset.stable).reduce((sum, asset) => sum + (asset.valueUsd ?? 0), 0),
  };
}

const matches = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

const compare: Record<AssetSort, (a: PortfolioAsset, b: PortfolioAsset) => number> = {
  value: (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0),
  change: (a, b) => (b.change.h24 ?? -Infinity) - (a.change.h24 ?? -Infinity),
  name: (a, b) => a.name.localeCompare(b.name),
};

/** The priced assets a view shows, filtered and sorted. `chainName` lets a search match a network. */
export function visibleAssets(assets: readonly PortfolioAsset[], view: PortfolioView, chainName: (chain: ChainId) => string): PortfolioAsset[] {
  return inChain(assets.filter(isPriced), view.chain)
    .filter((asset) => matches(`${asset.name} ${asset.symbol} ${asset.address} ${chainName(asset.chain)}`, view.q) && (!view.small || (asset.valueUsd ?? 0) >= SMALL_USD))
    .sort(compare[view.sort]);
}

/** The tokens with no reliable price in a view; a search reaches them too. */
export function unpricedAssets(assets: readonly PortfolioAsset[], view: PortfolioView): PortfolioAsset[] {
  return inChain(assets, view.chain).filter((asset) => !isPriced(asset) && matches(`${asset.name} ${asset.symbol} ${asset.address}`, view.q));
}

export function visibleActivity(items: readonly PortfolioActivity[], view: PortfolioView, chainName: (chain: ChainId) => string): PortfolioActivity[] {
  return inChain(items, view.chain).filter((item) => {
    if (view.type !== "all" && item.type !== (view.type as ActivityType)) return false;
    const symbols = [...item.received, ...item.sent].map((leg) => leg.symbol).join(" ");
    return matches(`${symbols} ${item.type} ${chainName(item.chain)} ${item.id}`, view.q);
  });
}

/** Where a holding trades: into the chain's coin, or into its stablecoin when it has the coin's address (wrapped SOL does too). */
export function swapHref(asset: Pick<PortfolioAsset, "chain" | "address">, coin: string, stable: string): string {
  const query = new URLSearchParams({ ...(asset.chain === "rh" ? { chain: "rh" } : {}), from: asset.address, to: asset.address === coin ? stable : coin });
  return `/swap?${query}`;
}
