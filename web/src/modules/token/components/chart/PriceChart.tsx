"use client";

import type { AutoscaleInfo, IChartApi, IPriceLine, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from "lightweight-charts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { hexToRgba } from "@/shared/lib/color";
import type { Candle, ChartCallout, ChartMark } from "@/shared/types/token-detail";
import type { ChartTheme } from "../../hooks/useChartTheme";
import { type ChartValue, formatAxisValue, formatChartValue, scaleCandle } from "../../lib/chart-data";
import { type ChartLib, chartOptions } from "./chart-options";
import { type ChartLayout, ChartOverlays } from "./ChartOverlays";

interface Handles {
  lib: ChartLib;
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  lines: IPriceLine[];
}

export interface PriceChartProps {
  candles: readonly Candle[];
  value: ChartValue;
  supply: number;
  /** The market cap the token graduates at, while it is in view: the dashed gold line. */
  graduationCap: number | null;
  /** The token's 24h direction, which colours the current-price line and tag. */
  up: boolean;
  theme: ChartTheme;
  showVolume: boolean;
  marks: readonly ChartMark[];
  callout: ChartCallout | null;
  coin: string;
  /** Full screen lets the mouse wheel zoom; on the page it scrolls the page. */
  fullscreen: boolean;
  onHover: (candle: Candle | null) => void;
}

const at = (time: number) => time as UTCTimestamp;

/** Candles and volume on TradingView's Lightweight Charts, with the export's lines, marks and callout on top. */
export function PriceChart(props: PriceChartProps) {
  const { candles, value, supply, graduationCap, up, theme, showVolume, marks, callout, coin, fullscreen } = props;
  const { lang } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const handles = useRef<Handles | null>(null);
  const fittedValue = useRef<string | null>(null);
  const frame = useRef(0);
  const latest = useRef(props);
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState<ChartLayout | null>(null);
  useEffect(() => {
    latest.current = props;
  });

  /** Where the overlays go, in the chart pane's pixels. */
  const measure = useCallback(() => {
    const h = handles.current;
    if (!h) return;
    const p = latest.current;
    const time = h.chart.timeScale();
    const y = (usd: number) => h.candles.priceToCoordinate(p.value === "mcap" ? usd : usd / p.supply);
    const byTime = new Map(p.candles.map((c) => [c.time, c]));
    const last = p.candles[p.candles.length - 1];
    const lastX = last ? time.timeToCoordinate(at(last.time)) : null;
    const lastY = last ? y(last.high) : null;
    const pane = h.chart.paneSize();
    setLayout({
      width: pane.width,
      height: pane.height,
      grad: p.graduationCap === null ? null : y(p.graduationCap),
      marks: p.marks.flatMap((mark) => {
        const candle = byTime.get(mark.time);
        const x = time.timeToCoordinate(at(mark.time));
        const low = candle ? y(candle.low) : null;
        return x === null || low === null ? [] : [{ x, y: low, kind: mark.kind }];
      }),
      last: lastX === null || lastY === null ? null : { x: lastX, y: lastY },
    });
  }, []);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    let gone = false;
    let resize: ResizeObserver | null = null;
    void import("lightweight-charts").then((lib) => {
      const el = box.current;
      if (gone || !el) return;
      const chart = lib.createChart(el, { autoSize: true });
      const series = chart.addSeries(lib.CandlestickSeries, { borderVisible: false, priceLineVisible: false });
      const volume = chart.addSeries(lib.HistogramSeries, { priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        const hovered = typeof param.time === "number" ? latest.current.candles.find((c) => c.time === param.time) : undefined;
        latest.current.onHover(hovered ?? null);
      });
      chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
      resize = new ResizeObserver(schedule);
      resize.observe(el);
      handles.current = { lib, chart, candles: series, volume, lines: [] };
      setReady(true);
    });
    return () => {
      gone = true;
      resize?.disconnect();
      cancelAnimationFrame(frame.current);
      handles.current?.chart.remove();
      handles.current = null;
    };
  }, [schedule]);

  useEffect(() => {
    const h = handles.current;
    if (ready && h) h.chart.applyOptions(chartOptions(h.lib, theme, lang, fullscreen));
  }, [ready, theme, lang, fullscreen]);

  useEffect(() => {
    const h = handles.current;
    if (!ready || !h) return;
    const scaled = candles.map((c) => scaleCandle(c, value, supply));
    const cap = graduationCap === null ? null : value === "mcap" ? graduationCap : graduationCap / supply;
    const tone = up ? theme.pos : theme.neg;
    h.chart.timeScale().applyOptions({ fixLeftEdge: scaled.length >= 30, fixRightEdge: scaled.length >= 30 });
    h.candles.applyOptions({
      upColor: theme.pos,
      downColor: theme.neg,
      wickUpColor: theme.pos,
      wickDownColor: theme.neg,
      priceLineColor: tone,
      priceFormat: {
        type: "custom",
        minMove: value === "mcap" ? 1 : 1e-12,
        formatter: (price: number) => formatChartValue(price, value),
        tickmarksFormatter: (prices: number[]) => prices.map((price) => formatAxisValue(price, value)),
      },
      // Keep the graduation line on screen with the candles.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange || cap === null) return info;
        return { ...info, priceRange: { ...info.priceRange, maxValue: Math.max(info.priceRange.maxValue, cap) } };
      },
    });
    h.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: showVolume ? 0.2 : 0.08 } });
    h.candles.setData(scaled.map((c) => ({ time: at(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    const [rise, fall] = [hexToRgba(theme.pos, 0.24), hexToRgba(theme.neg, 0.24)];
    h.volume.setData(showVolume ? candles.map((c) => ({ time: at(c.time), value: c.volume, color: c.close >= c.open ? rise : fall })) : []);
    for (const line of h.lines) h.candles.removePriceLine(line);
    const dashed = { lineWidth: 1, lineStyle: h.lib.LineStyle.Dashed, axisLabelVisible: false } as const;
    const last = scaled[scaled.length - 1];
    h.lines = [
      ...(last ? [h.candles.createPriceLine({ ...dashed, price: last.close, color: hexToRgba(tone, 0.6) })] : []),
      ...(cap === null ? [] : [h.candles.createPriceLine({ ...dashed, price: cap, color: hexToRgba(theme.gold, 0.75) })]),
    ];
    // Preserve the user's zoom and position when polling supplies new candles.
    // A new timeframe remounts the chart; changing units also refits it.
    if (fittedValue.current !== value) {
      h.chart.timeScale().fitContent();
      // Fresh live histories may contain only one or two candles. Keep their
      // width readable instead of stretching a single candle across the pane.
      if (scaled.length < 30) h.chart.timeScale().setVisibleLogicalRange({ from: scaled.length - 30, to: scaled.length + 2 });
      fittedValue.current = value;
    }
    schedule();
  }, [ready, candles, value, supply, graduationCap, up, theme, showVolume, schedule]);

  // Marks switched on or off move nothing on the canvas; only the overlays need placing again.
  useEffect(() => {
    if (ready) schedule();
  }, [ready, marks, schedule]);

  return (
    <div className="relative size-full">
      <div ref={box} className="absolute inset-0" />
      {layout ? <ChartOverlays layout={layout} graduationCap={graduationCap} callout={callout} coin={coin} /> : null}
    </div>
  );
}
