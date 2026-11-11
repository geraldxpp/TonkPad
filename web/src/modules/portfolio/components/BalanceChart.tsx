"use client";

import { EyeOff } from "lucide-react";
import { useId } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { PricePoint } from "../lib/types";

const WIDTH = 800;
const HEIGHT = 180;
const LEFT = 8;
const RIGHT = 792;

interface BalanceChartProps {
  points: readonly PricePoint[];
  hidden: boolean;
  /** What the chart shows, in words, for assistive tech. */
  description: string;
}

/** Where each point sits in the chart's box, by its real time, so uneven gaps stay uneven. */
function layout(points: readonly PricePoint[]): [number, number][] {
  const values = points.map(([, value]) => value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const start = points[0][0];
  const length = points[points.length - 1][0] - start || 1;
  return points.map(([time, value]) => [LEFT + ((time - start) / length) * (RIGHT - LEFT), span > 0 ? 151 - ((value - low) / span) * 120 : 100]);
}

/** The value of today's holdings over the range: a line over a soft fill, ending in a dot at now. */
export function BalanceChart({ points, hidden, description }: BalanceChartProps) {
  const { t } = useI18n();
  const id = useId();
  if (hidden) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12px] text-text-3">
        <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
        {t.portfolio.balance.hiddenChart}
      </div>
    );
  }
  if (points.length < 2) return <div aria-hidden="true" className="h-full" />;
  const placed = layout(points);
  const path = placed.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const [endX, endY] = placed[placed.length - 1];
  return (
    <div className="relative h-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={description} className="block size-full overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.19" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 90, 140].map((y) => (
          <line key={y} x1="0" x2={WIDTH} y1={y} y2={y} stroke="var(--line)" strokeWidth="0.8" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${path} L${RIGHT},178 L${LEFT},178 Z`} fill={`url(#${id})`} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* In HTML, not the SVG: the chart stretches to fit, and a stretched circle would be an oval. */}
      <span aria-hidden="true" className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_5px_rgb(var(--accent-rgb)/0.12)]" style={{ left: `${(endX / WIDTH) * 100}%`, top: `${(endY / HEIGHT) * 100}%` }} />
    </div>
  );
}
