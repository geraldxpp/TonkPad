"use client";

import { GraduationCap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsdCompact } from "@/shared/lib/format";
import type { ChartCallout, ChartMark } from "@/shared/types/token-detail";
import { walletDot } from "../../lib/display";

interface Point {
  x: number;
  y: number;
}

/** Overlay positions in the chart pane's pixels (null when off screen). */
export interface ChartLayout {
  width: number;
  height: number;
  /** The graduation line's y. */
  grad: number | null;
  /** Each mark at its candle's x and low. */
  marks: Array<Point & { kind: ChartMark["kind"] }>;
  /** The last candle's x and high, for the callout. */
  last: Point | null;
}

interface ChartOverlaysProps {
  layout: ChartLayout;
  graduationCap: number | null;
  callout: ChartCallout | null;
  coin: string;
}

/** The callout needs this much room left of the last candle; on narrower charts it would cover the candles. */
const CALLOUT_ROOM = 320;

/** The graduation label, the W and S marks under their candles, and the smart-wallet callout. */
export function ChartOverlays({ layout, graduationCap, callout, coin }: ChartOverlaysProps) {
  const { t } = useI18n();
  const c = t.token.chart;
  const { width, height, grad, marks, last } = layout;
  const inside = (x: number) => x >= 0 && x <= width;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {grad !== null && graduationCap !== null && grad >= 0 && grad <= height - 34 ? (
        <span
          className="absolute left-2.5 z-[2] inline-flex items-center gap-1.5 rounded-lg bg-gold/14 px-2 py-1 text-[12px] font-semibold text-gold"
          style={{ top: grad + 8 }}
        >
          <GraduationCap size={13} strokeWidth={2.2} />
          {fmt(c.graduation, { cap: formatUsdCompact(graduationCap, { trimZeros: true }) })}
        </span>
      ) : null}
      {marks.filter((mark) => inside(mark.x)).map((mark) => (
        <span
          key={`${mark.kind}-${mark.x}`}
          title={mark.kind === "whale" ? c.whale : c.smart}
          className={cn(
            "pointer-events-auto absolute flex size-[18px] -translate-x-1/2 items-center justify-center rounded-full border-[1.5px] bg-surface text-[10px] font-bold",
            mark.kind === "whale" ? "border-gold text-gold" : "border-cyan text-cyan",
          )}
          style={{ left: mark.x, top: Math.min(mark.y + 8, height - 24) }}
        >
          {mark.kind === "whale" ? "W" : "S"}
        </span>
      ))}
      {callout && last && inside(last.x) && last.x >= CALLOUT_ROOM ? (
        <span
          className="absolute z-[3] inline-flex -translate-x-full items-center gap-2 rounded-[10px] border border-cyan/50 bg-raised px-2.5 py-1.5 whitespace-nowrap"
          style={{ left: last.x - 10, top: Math.max(4, last.y - 42) }}
        >
          <span className="size-4 rounded-full" style={{ background: walletDot(callout.trader) }} />
          <span className="text-[12px] font-semibold">
            {fmt(c.bought, { trader: callout.trader, amount: callout.native, unit: coin })}
          </span>
          <span className="font-mono text-[12px] font-medium text-pos">{fmt(c.win, { pct: Math.round(callout.winRate * 100) })}</span>
        </span>
      ) : null}
    </div>
  );
}
