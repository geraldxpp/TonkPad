// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Candle } from "@/shared/types/token-detail";
import { aggregate, fromRaw, joinHistory, timeframeCandles, withObservation } from "../src/charts/candles";
import { ponsCandles } from "../src/charts/pons";
import { applyCurveTrade, newPonsState } from "../src/pons/curve";
import { parseOhlcv } from "../src/sources/geckoterminal";
import { NATIVE_ETH, USDG } from "../src/sources/pons";
import { MIN, NOW, SEC, tracked } from "./fixtures";

/** NOW in unix seconds: 6 Nov 2026, 12:00 UTC, on an hour, 4-hour and half-day boundary. */
const T = NOW / 1000;
const c = (time: number, open: number, high: number, low: number, close: number, volume = 1): Candle => ({ time, open, high, low, close, volume });
const minutes = (from: number, count: number) => Array.from({ length: count }, (_, i) => c(from + i * 60, 1, 1, 1, 1, 1));
const rounded = (candles: Candle[]) => candles.map((k) => Object.fromEntries(Object.entries(k).map(([key, v]) => [key, Math.round(v * 1e6) / 1e6])));

describe("GeckoTerminal candles", () => {
  it("keeps valid rows, oldest first, with high and low holding the open and close", () => {
    const body = {
      data: {
        attributes: {
          ohlcv_list: [
            [T + 60, 2, 3, 1.5, 2.5, 10],
            [T, 1, 1.8, 0.9, 2, 5],
            [T + 120, "x", 1, 1, 1, 1],
            [T + 180, 1, 1, 1, 1, -1],
            [T + 240, 0, 1, 1, 1, 1],
          ],
        },
      },
    };
    expect(parseOhlcv(body)).toEqual([[T, 1, 2, 0.9, 2, 5], [T + 60, 2, 3, 1.5, 2.5, 10]]);
    expect(parseOhlcv({ errors: [{ status: "404" }] })).toEqual([]);
  });

  it("turns USD per token into market cap and USD volume into the chain's coin", () => {
    expect(fromRaw([[T, 1e-5, 2e-5, 5e-6, 1.5e-5, 300]], 1e9, 150)).toEqual([c(T, 10_000, 20_000, 5_000, 15_000, 2)]);
    expect(fromRaw([[T, 1e-5, 1e-5, 1e-5, 1e-5, 300]], 1e9, null)[0].volume).toBe(0);
  });
});

describe("candle math", () => {
  it("aggregates exactly: first open, last close, extremes, summed volume", () => {
    const run = [c(T, 10, 12, 9, 11, 1), c(T + 60, 11, 15, 11, 14, 2), c(T + 300, 14, 14, 8, 9, 4)];
    expect(aggregate(run, 300)).toEqual([c(T, 10, 15, 9, 14, 3), c(T + 300, 14, 14, 8, 9, 4)]);
  });

  it("moves the last minute with a newer market cap, and leaves a later minute to the next fetch", () => {
    const run = [c(T, 10, 12, 9, 11, 3)];
    expect(withObservation(run, (T + 30) * SEC, 13)).toEqual([c(T, 10, 13, 9, 13, 3)]);
    expect(withObservation(run, (T + 90) * SEC, 8)).toEqual(run);
    expect(withObservation(run, (T - 60) * SEC, 8)).toEqual(run);
    expect(withObservation([], T * SEC, 8)).toEqual([]);
  });

  it("keeps only buckets the minutes cover in full, at most 60", () => {
    // Every minute from 12:10 for 200 minutes.
    const history = { minute: minutes(T + 600, 200), from: T + 600, older: [], olderFrom: T + 600 };
    expect(timeframeCandles(history, "1m")).toHaveLength(60);
    expect(timeframeCandles(history, "5m")[0]).toEqual(c(T + 600, 1, 1, 1, 1, 5));
    expect(timeframeCandles(history, "15m")[0]).toEqual(c(T + 900, 1, 1, 1, 1, 15));
    expect(timeframeCandles(history, "1h").map((k) => [k.time, k.volume])).toEqual([[T + 3_600, 60], [T + 7_200, 60], [T + 10_800, 30]]);
    // Minutes that reach back to the first trade keep their first, partial hour.
    expect(timeframeCandles({ ...history, from: null }, "1h")[0]).toEqual(c(T, 1, 1, 1, 1, 50));
  });

  it("fills hours before the minutes from hour candles", () => {
    const older = [c(T - 3_600, 1, 2, 1, 2, 10), c(T, 2, 3, 2, 3, 10), c(T + 3_600, 3, 4, 3, 4, 10)];
    const history = { minute: [c(T + 5_400, 4, 6, 4, 5), c(T + 7_500, 5, 7, 5, 6)], from: T + 5_400, older, olderFrom: null };
    expect(timeframeCandles(history, "1h")).toEqual([...older, c(T + 7_200, 5, 7, 5, 6)]);
    expect(timeframeCandles(history, "4h")).toEqual([c(T - 14_400, 1, 2, 1, 2, 10), c(T, 2, 7, 2, 6, 21)]);
    expect(timeframeCandles(history, "15m").map((k) => k.time)).toEqual([T + 5_400, T + 7_200]);
  });

  it("puts a curve's minutes before its pool's, sharing the minute it graduated in", () => {
    const curve = { candles: [c(T, 1, 2, 1, 2), c(T + 60, 2, 3, 2, 3), c(T + 120, 3, 3, 3, 3), c(T + 240, 9, 9, 9, 9)], complete: true };
    const pool = { candles: [c(T + 120, 3, 5, 3, 4, 2), c(T + 180, 4, 4, 4, 4, 2)], complete: true };
    const history = joinHistory(curve, pool, null);
    expect(history.from).toBeNull();
    expect(timeframeCandles(history, "1m")).toEqual([curve.candles[0], curve.candles[1], c(T + 120, 3, 5, 3, 4, 3), pool.candles[1]]);
    expect(joinHistory({ ...curve, complete: false }, pool, null).from).toBe(T);
  });

  it("keeps the curve behind the pool's hours when the pool's minutes stop short", () => {
    const curve = { candles: [c(T - 7_200, 1, 2, 1, 2), c(T - 3_600, 2, 3, 2, 3)], complete: true };
    const pool = { candles: minutes(T + 3_600, 3), complete: false };
    const hour = { candles: [c(T - 3_600, 3, 4, 3, 4, 9), c(T, 4, 5, 4, 5, 9)], complete: true };
    expect(joinHistory(curve, pool, null)).toEqual({ minute: pool.candles, from: T + 3_600, older: [], olderFrom: T + 3_600 });
    const history = joinHistory(curve, pool, hour);
    expect(history).toEqual({ minute: pool.candles, from: T + 3_600, older: [...curve.candles, ...hour.candles], olderFrom: null });
    // The hour it graduated in opens on the curve and closes in the pool.
    expect(timeframeCandles(history, "1h").slice(0, 3)).toEqual([curve.candles[0], c(T - 3_600, 2, 4, 2, 4, 10), hour.candles[1]]);
  });
});

describe("Pons curve candles", () => {
  /** A curve with 10 ETH to graduate: 4 virtual ETH against 1B tokens at launch. */
  function curveToken(quote = NATIVE_ETH) {
    const launched = NOW - 10 * MIN;
    const pons = newPonsState({ curve: "0xcurve", quote, quoteDecimals: 18, threshold: 10, launchTx: "launch" });
    const trade = (buy: boolean, amount: number, tokens: number, at: number) =>
      applyCurveTrade(pons, { buy, quote: amount, tokens, fee: 0, tax: 0, at });
    trade(true, 1, 2e8, launched); // spot 5 / 8e8
    trade(true, 1, 1e9 / 7.5, launched + 30 * SEC); // spot 6 / (8e8 - 1.333e8)
    trade(false, 1, 1e9 / 7.5, launched + 90 * SEC); // back to 5 / 8e8
    return tracked({ chain: "rh", launchpad: "pons", pons, createdAt: launched });
  }

  it("opens each minute at the price before its first trade, with volume in ETH", () => {
    const run = ponsCandles(curveToken(), 3_000, 3_000);
    const m = (NOW - 10 * MIN) / SEC;
    expect(run).toMatchObject({ complete: true, volume: true });
    expect(rounded(run!.candles)).toEqual([c(m, 12_000, 27_000, 12_000, 27_000, 2), c(m + 60, 27_000, 27_000, 18_750, 18_750, 1)]);
  });

  it("converts a stable quote's volume to ETH, and leaves trimmed curves incomplete", () => {
    const token = curveToken(USDG);
    expect(ponsCandles(token, 1, 2_000)!.candles.map((k) => k.volume)).toEqual([0.001, 0.0005]);
    expect(ponsCandles(token, 1, null)).toMatchObject({ volume: false });
    token.createdAt -= 2 * MIN;
    const trimmed = ponsCandles(token, 1, 2_000);
    expect(trimmed?.complete).toBe(false);
    expect(trimmed?.candles[0].open).toBe(6.25);
  });
});
