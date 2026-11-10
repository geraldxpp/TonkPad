"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { ChainId } from "@/shared/types/chain";
import { type Candle, CHART_TIMEFRAMES, type TokenChart } from "@/shared/types/token-detail";
import { Segmented } from "@/shared/ui/Segmented";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useFullscreen } from "../../hooks/useFullscreen";
import { type ChartValue, DEFAULT_CHART_VALUE, DEFAULT_TIMEFRAME, graduationInView, parseChartValue, parseTimeframe, readoutOf } from "../../lib/chart-data";
import { coinOf } from "../../lib/format";
import { ChartReadout } from "./ChartReadout";
import { type Indicators, IndicatorsMenu } from "./IndicatorsMenu";
import { PriceChart } from "./PriceChart";

interface ChartCardProps {
  chart: TokenChart;
  supply: number | null;
  chain: ChainId;
  /** The token's 24h direction. */
  up: boolean;
}

/**
 * The chart inside the token's market card: timeframes (kept in the URL),
 * indicators, full screen, the readout and the chart. The card's heading holds
 * Price / MCap; full screen brings its own copy.
 */
export function ChartCard({ chart, supply, chain, up }: ChartCardProps) {
  const { t } = useI18n();
  const c = t.token.chart;
  const { params, setParams } = useUrlParams();
  const tf = parseTimeframe(params.get("tf"));
  const hasSupply = supply !== null && supply > 0;
  const value = hasSupply ? parseChartValue(params.get("chart")) : "mcap";
  const theme = useChartTheme();
  const { ref, full, overlay, toggle } = useFullscreen<HTMLElement>();
  const [hover, setHover] = useState<Candle | null>(null);
  const [indicators, setIndicators] = useState<Indicators>({ volume: true, marks: true });

  const candles = chart.candles[tf];
  const shown = (hover ? candles.find((candle) => candle.time === hover.time) : null) ?? candles[candles.length - 1];
  const volumeAvailable = chart.volumeAvailable !== false;
  const coin = coinOf(chain);
  return (
    <section
      ref={ref}
      aria-label={c.label}
      className={cn(
        "overflow-hidden border-t border-line bg-surface",
        full && "flex flex-col",
        overlay && "fixed inset-0 z-[80] border-0",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 max-md:gap-1 max-md:px-2.5">
        {full ? (
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
        ) : null}
        <div className="min-w-0">
          <Segmented
            size="chart"
            label={c.timeframe}
            value={tf}
            onChange={(next) => {
              setHover(null);
              setParams({ tf: next === DEFAULT_TIMEFRAME ? null : next });
            }}
            options={CHART_TIMEFRAMES.map((id) => ({ id, label: id }))}
          />
        </div>
        <span className="flex-auto" />
        {volumeAvailable ? <IndicatorsMenu value={indicators} onChange={setIndicators} /> : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={full ? c.exitFullScreen : c.fullScreen}
          title={full ? c.exitFullScreen : c.fullScreen}
          className="inline-flex size-7 flex-none items-center justify-center rounded-[5px] text-text-3 hover:bg-raised hover:text-text"
        >
          {full ? <Minimize2 size={15} strokeWidth={1.8} aria-hidden="true" /> : <Maximize2 size={15} strokeWidth={1.8} aria-hidden="true" />}
        </button>
      </div>
      {shown ? <ChartReadout readout={readoutOf(shown, value, supply)} coin={coin} showVolume={volumeAvailable} /> : null}
      {!volumeAvailable ? <p className="px-5 pt-2 text-[12px] text-text-3">{t.token.live.history}</p> : null}
      <div className={cn("relative mt-1.5 mb-1 pl-5", full ? "min-h-[340px] flex-1" : "h-[340px]")}>
        {theme && candles.length > 0 ? (
          <PriceChart
            key={tf}
            candles={candles}
            value={value}
            supply={supply ?? 1}
            graduationCap={graduationInView(candles, chart.graduationCap) ? chart.graduationCap : null}
            up={up}
            theme={theme}
            showVolume={volumeAvailable && indicators.volume}
            marks={indicators.marks ? chart.marks[tf] : []}
            callout={indicators.marks ? chart.callout : null}
            coin={coin}
            fullscreen={full}
            onHover={setHover}
          />
        ) : candles.length === 0 ? <p className="flex h-full items-center justify-center pr-5 text-[13px] text-text-3">{t.token.live.unavailable}</p> : null}
      </div>
    </section>
  );
}
