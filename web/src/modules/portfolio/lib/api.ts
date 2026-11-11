import { sameAddress } from "@/shared/lib/address";
import type { ChainId } from "@/shared/types/chain";
import type { ActivityPage, ChainPortfolio, MarketSeries, PortfolioRange } from "./types";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const portfolioPath = (chain: ChainId, owner: string) => `/api/portfolio/${chain}/${encodeURIComponent(owner)}`;

export const activityPath = (chain: ChainId, owner: string, cursor: string | null) => `${portfolioPath(chain, owner)}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;

export const marketPath = (range: PortfolioRange) => `/api/portfolio/market?range=${range}`;

/** Rejects a malformed response, or one for another wallet or chain. */
export function isChainPortfolio(value: unknown, chain: ChainId, owner: string): value is ChainPortfolio {
  return record(value) && value.chain === chain && typeof value.owner === "string" && sameAddress(value.owner, owner) && Array.isArray(value.assets) && typeof value.readAt === "number" && typeof value.unpriced === "number";
}

export function isActivityPage(value: unknown, chain: ChainId, owner: string): value is ActivityPage {
  return record(value) && value.chain === chain && typeof value.owner === "string" && sameAddress(value.owner, owner) && Array.isArray(value.items) && (value.next === null || typeof value.next === "string");
}

export function isMarketSeries(value: unknown, range: PortfolioRange): value is MarketSeries {
  return record(value) && value.range === range && (value.SOL === null || Array.isArray(value.SOL)) && (value.ETH === null || Array.isArray(value.ETH));
}
