import type { ChartOptions, DeepPartial, Time } from "lightweight-charts";
import { hexToRgba } from "@/shared/lib/color";
import type { ChartTheme } from "../../hooks/useChartTheme";

export type ChartLib = typeof import("lightweight-charts");

const dateOf = (time: Time) => new Date((typeof time === "number" ? time : 0) * 1000);

/** Axis and crosshair times in the viewer's own time zone and language: "09:00", "Nov 4". */
function formatters(lang: string) {
  const hm = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const day = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" });
  const month = new Intl.DateTimeFormat(lang, { month: "short" });
  const year = new Intl.DateTimeFormat(lang, { year: "numeric" });
  return { hm, day, month, year };
}

/** The chart's look, from the theme tokens. `wheel` lets the mouse wheel zoom and scroll (full screen only). */
export function chartOptions(lib: ChartLib, theme: ChartTheme, lang: string, wheel: boolean): DeepPartial<ChartOptions> {
  const f = formatters(lang);
  const crossLine = { color: hexToRgba(theme.text3, 0.55), width: 1 as const, style: lib.LineStyle.Dashed, labelBackgroundColor: theme.raised };
  return {
    layout: {
      background: { type: lib.ColorType.Solid, color: "transparent" },
      textColor: theme.text3,
      fontSize: 12,
      fontFamily: theme.mono,
      // Lightweight Charts' licence asks for a credit to TradingView; its own small logo is that credit.
      attributionLogo: true,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: theme.line } },
    rightPriceScale: { borderVisible: false, minimumWidth: 64, scaleMargins: { top: 0.06, bottom: 0.2 } },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      tickMarkFormatter: (time: Time, type: number) => {
        const date = dateOf(time);
        if (type === lib.TickMarkType.Year) return f.year.format(date);
        if (type === lib.TickMarkType.Month) return f.month.format(date);
        if (type === lib.TickMarkType.DayOfMonth) return f.day.format(date);
        return f.hm.format(date);
      },
    },
    crosshair: { mode: lib.CrosshairMode.Normal, vertLine: crossLine, horzLine: crossLine },
    localization: { locale: lang, timeFormatter: (time: Time) => `${f.day.format(dateOf(time))} · ${f.hm.format(dateOf(time))}` },
    handleScroll: { mouseWheel: wheel, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: wheel, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
  };
}
