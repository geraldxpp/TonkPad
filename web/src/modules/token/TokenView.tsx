"use client";

import type { TokenDetail } from "@/shared/types/token-detail";
import { ActivityCard } from "./components/activity/ActivityCard";
import { InsightsCard } from "./components/InsightsCard";
import { MarketCard } from "./components/MarketCard";
import { TokenAside, tradeTokenOf } from "./components/TokenAside";
import { TokenBreadcrumb } from "./components/TokenBreadcrumb";
import { TokenHeader } from "./components/TokenHeader";
import { TradeDock } from "./components/trade/TradeDock";
import { moneyCompact, moneyPrice } from "./lib/money";

/**
 * The token screen, for mock and refreshing live data alike: the identity,
 * the market card (price, chart, curve, figures), activity and insights, with
 * the trade column beside them from 1024 px. Phones trade from a bottom bar.
 */
export function TokenView({ detail }: { detail: TokenDetail }) {
  const marketAvailable = detail.marketAvailable !== false;
  const price = !marketAvailable ? "—" : detail.priceUsd !== null ? moneyPrice(detail.priceUsd) : moneyCompact(detail.token.marketCap);
  return (
    <div className="flex w-full min-w-0 flex-col gap-5 max-md:gap-4 max-md:pb-2">
      <TokenBreadcrumb name={detail.token.name} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_336px] xl:grid-cols-[minmax(0,1fr)_360px] max-lg:gap-5">
        <div className="flex min-w-0 flex-col gap-5 max-md:gap-4">
          <TokenHeader detail={detail} />
          <MarketCard detail={detail} />
          <ActivityCard detail={detail} />
          <InsightsCard detail={detail} />
        </div>
        <TokenAside detail={detail} />
      </div>
      <TradeDock token={tradeTokenOf(detail)} live={detail.source === "live"} price={price} />
    </div>
  );
}
