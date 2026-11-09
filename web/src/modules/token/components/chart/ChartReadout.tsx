"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { Readout } from "../../lib/chart-data";

/** O H L C, the candle's move and its volume: the hovered candle, else the newest. */
export function ChartReadout({ readout, coin, showVolume = true }: { readout: Readout; coin: string; showVolume?: boolean }) {
  const { t } = useI18n();
  const c = t.token.chart;
  const cells = [
    [c.open, readout.open],
    [c.high, readout.high],
    [c.low, readout.low],
    [c.close, readout.close],
  ] as const;
  return (
    <div data-testid="chart-readout" className="flex flex-wrap gap-x-3.5 gap-y-1 px-5 font-mono text-[12px] text-text-2">
      {cells.map(([label, value]) => (
        <span key={label}>
          <span className="text-text-3">{label}</span> {value}
        </span>
      ))}
      <span className={cn(readout.up ? "text-pos" : "text-neg")}>{readout.change}</span>
      {showVolume ? <span>
        <span className="text-text-3">{c.volume}</span> {readout.volume} {coin}
      </span> : null}
    </div>
  );
}
