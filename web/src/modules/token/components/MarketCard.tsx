"use client";

import { GraduationCap } from "lucide-react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatPrice, formatUsdCompact } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { CurveBar } from "@/shared/ui/CurveBar";
import { Segmented } from "@/shared/ui/Segmented";
import { type ChartValue, DEFAULT_CHART_VALUE, parseChartValue } from "../lib/chart-data";
import { ChartCard } from "./chart/ChartCard";
import { StatsStrip } from "./StatsStrip";

/** The bonding curve under the chart: progress to graduation, or Graduated. */
function CurveProgress({ curve }: { curve: number }) {
  const { t } = useI18n();
  if (curve >= 1) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-5 py-3.5 text-[12px] font-medium text-gold max-md:px-3.5">
        <GraduationCap size={15} strokeWidth={2} aria-hidden="true" />
        {t.badges.graduated}
      </div>
    );
  }
  const [before, after = ""] = t.token.toGraduation.split("{pct}");
  return (
    <div className="flex flex-col gap-2 border-t border-line px-5 pt-3.5 pb-4 max-md:px-3.5">
      <div className="flex items-center gap-2 text-[11px] text-text-3">
        <span aria-hidden="true" className="size-[5px] flex-none rounded-full bg-accent" />
        <span className="min-w-0 truncate">{t.token.holders.curve}</span>
        <span className="ml-auto whitespace-nowrap">
          {before}
          <strong className="font-mono text-[12px] font-semibold text-accent-text">{Math.round(curve * 100)}%</strong>
          {after}
        </span>
        <GraduationCap size={14} strokeWidth={2} className="flex-none text-accent-text" aria-hidden="true" />
      </div>
      <CurveBar value={curve} className="h-[3px] w-full" />
    </div>
  );
}

/**
 * The token's market in one card: the price (or market cap) with its 24h
 * move and the Price / MCap switch (kept in the URL), the chart, the bonding
 * curve and the four market figures.
 */
export function MarketCard({ detail }: { detail: TokenDetail }) {
  const { t } = useI18n();
  const c = t.token.chart;
  const { params, setParams } = useUrlParams();
  const { token } = detail;
  const hasSupply = detail.supply !== null && detail.supply > 0;
  const value: ChartValue = hasSupply ? parseChartValue(params.get("chart")) : "mcap";
  const marketAvailable = detail.marketAvailable !== false;
  const up = token.change24h >= 0;
  const figure = !marketAvailable
    ? "—"
    : value === "price"
      ? detail.priceUsd === null
        ? "—"
        : formatPrice(detail.priceUsd)
      : formatUsdCompact(token.marketCap);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 max-md:px-3.5 max-md:pt-4 max-md:pb-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] text-text-3">{value === "price" ? t.token.price : t.token.marketCap}</span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[30px] leading-9 font-semibold tracking-[-0.045em] [overflow-wrap:anywhere] max-md:text-[26px] max-md:leading-8">
              {figure}
            </span>
            <span className={cn("font-mono text-[12px] font-semibold", !marketAvailable ? "text-text-3" : up ? "text-pos" : "text-neg")}>
              {marketAvailable ? formatChange(token.change24h) : "—"}
            </span>
            <span className="text-[11px] text-text-3">{t.token.h24}</span>
          </div>
        </div>
        <Segmented<ChartValue>
          size="toggle"
          label={c.value}
          value={value}
          onChange={(next) => setParams({ chart: next === DEFAULT_CHART_VALUE ? null : next })}
          options={[
            { id: "price", label: c.price, disabled: !hasSupply },
            { id: "mcap", label: c.mcap },
          ]}
        />
      </div>
      <ChartCard chart={detail.chart} supply={detail.supply} chain={token.chain} up={up} />
      <CurveProgress curve={token.curve} />
      <StatsStrip detail={detail} />
    </div>
  );
}
