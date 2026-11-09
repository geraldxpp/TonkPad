"use client";

import type { TokenDetail } from "@/shared/types/token-detail";
import { AboutCard } from "./components/AboutCard";
import { ActivityCard } from "./components/activity/ActivityCard";
import { ChartCard } from "./components/chart/ChartCard";
import { StatsStrip } from "./components/StatsStrip";
import { TokenAside } from "./components/TokenAside";
import { TokenBreadcrumb } from "./components/TokenBreadcrumb";
import { TokenHeader } from "./components/TokenHeader";

/** The same complete screen renders both mock data and refreshing live data. */
export function TokenView({ detail }: { detail: TokenDetail }) {
  return (
    <div className="flex w-full max-w-[1284px] flex-col gap-4 md:-mt-3">
      <TokenBreadcrumb name={detail.token.name} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <TokenHeader detail={detail} />
          <ChartCard chart={detail.chart} supply={detail.supply} chain={detail.token.chain} up={detail.token.change24h >= 0} />
          <StatsStrip detail={detail} />
          <ActivityCard detail={detail} />
          <AboutCard detail={detail} />
        </div>
        <TokenAside detail={detail} />
      </div>
    </div>
  );
}
