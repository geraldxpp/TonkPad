import { describe, expect, it } from "vitest";
import type { Candle } from "@/shared/types/token-detail";
import { ChartBook } from "../src/charts/book";
import type { PoolHistory } from "../src/charts/pools";
import { applyCurveTrade, newPonsState } from "../src/pons/curve";
import type { RawCandle } from "../src/sources/geckoterminal";
import { NATIVE_ETH } from "../src/sources/pons";
import { TokenStore } from "../src/store";
import { createViews } from "../src/views/cache";
import { findTrackedToken, tokenView, validTokenAddress } from "../src/views/token";
import { observedCandles } from "../src/views/token-chart";
import { address, MIN, NOW, priced, SEC, tracked } from "./fixtures";

const status = { solUsd: 100, ethUsd: 3_000, rhGasGwei: null };
const T = NOW / 1000;
const round = (candle: Candle) => Object.fromEntries(Object.entries(candle).map(([key, v]) => [key, Math.round(v * 1e3) / 1e3]));
/** `count` minutes of trades ending at NOW, each closing $1K of market cap higher, $150 traded a minute. */
const minutes = (count: number, start = T - count * 60): RawCandle[] =>
  Array.from({ length: count }, (_, i) => [start + i * 60, (30 + i) * 1e-6, (30.5 + i) * 1e-6, (29.5 + i) * 1e-6, (31 + i) * 1e-6, 150]);
const pools = (history: Partial<PoolHistory>) => ({
  history: () => ({ minute: [], minuteComplete: true, hour: null, hourComplete: false, fetchedAt: NOW, ...history }),
});
const evm = "0x1234567890abcdef1234567890abcdef12345678";
const sol = "So11111111111111111111111111111111111111112";

describe("live token detail", () => {
  it("keeps the selected token's identity, observed values and full contract", () => {
    const token = priced(40_000, { h24: { buys: 10, sells: 4 }, h1: { buys: 3, sells: 1 } }, {
      address: sol, name: "Actual token", symbol: "ACT", priceUsd: 0.04,
      supply: 1e12, decimals: 6, liquidityUsd: 2_000, top10Share: 0.24,
      mcapSeries: [[NOW - MIN, 39_000], [NOW, 40_000]],
      holderBalances: [{ owner: sol, amount: 3e10 }],
    });
    const detail = tokenView(token, status, NOW);
    expect(detail).toMatchObject({
      source: "live", marketAvailable: true, contract: sol, priceUsd: 0.04, supply: 1_000_000,
      token: { name: "Actual token", ticker: "ACT", address: sol },
      stats: { txns24h: 14, liquidity: 20, holdersChange1h: null, top10Share: 0.24 },
      flow1h: { buys: 3, sells: 1 },
      crew: null, agent: null, devLock: null, trades: [], topTraders: [],
      chart: { volumeAvailable: false, callout: null, graduationCap: null },
    });
    expect(detail.holders).toEqual([{ address: sol, tag: null, tokens: 30_000, share: 0.03, crewEarned: null }]);
    expect(detail.chart.candles["1m"].map((c) => c.close)).toEqual([39_000, 40_000]);
  });

  it("does not turn absent market, raw supply, or unavailable facts into mock numbers", () => {
    const detail = tokenView(tracked({ supply: 1e15, mcapSeries: [] }), { solUsd: null, ethUsd: null, rhGasGwei: null }, NOW);
    expect(detail).toMatchObject({
      marketAvailable: false, priceUsd: null, supply: null, nativeUsd: null,
      stats: { liquidity: null, txns24h: null, holdersChange1h: null, top10Share: null },
      holders: [], trades: [], topTraders: [], flow1h: null,
    });
    expect(detail.chart.candles["15m"]).toEqual([]);
    expect(detail.chart.marks["15m"]).toEqual([]);
  });

  it("shows curve holder balances while current and drops them at graduation", () => {
    const pons = newPonsState({ curve: evm, quote: evm, threshold: 10, quoteDecimals: 18, launchTx: "tx" });
    pons.balances = { [evm]: 25_000_000 };
    const token = priced(20_000, {}, { address: evm, chain: "rh", launchpad: "pons", pons, top10Share: 0.025 });
    expect(tokenView(token, status, NOW)).toMatchObject({
      supply: 1e9, curve: evm,
      holders: [{ address: evm, share: 0.025, tokens: 25_000_000, crewEarned: null }],
    });
    token.graduated = true;
    expect(tokenView(token, status, NOW)).toMatchObject({ holders: [], stats: { top10Share: null }, curve: null });
  });

  it("resolves EVM case-insensitively without changing Solana address case", () => {
    const tokens = [tracked({ address: sol }), tracked({ address: evm, chain: "rh" })];
    expect(findTrackedToken(tokens, evm.toUpperCase())).toBe(tokens[1]);
    expect(findTrackedToken(tokens, sol.toLowerCase())).toBeUndefined();
    expect(validTokenAddress(sol)).toBe(true);
    expect(validTokenAddress(evm)).toBe(true);
    for (const value of ["GHOST", "../list", "a/b", "0x123", "%zz", "0".repeat(44)]) expect(validTokenAddress(value)).toBe(false);
  });

  it("prioritizes selected tokens for the existing metadata and holder refresh loops", async () => {
    const store = new TokenStore();
    store.add(tracked({ address: sol, marketCap: 0 }));
    const views = createViews(store, status, []);
    expect(await views.token("missing")).toBeNull();
    expect((await views.token(sol))?.contract).toBe(sol);
    expect(views.visibleAddresses().has(sol)).toBe(true);
  });
});

describe("observed market-cap candles", () => {
  it("aggregates actual samples and leaves gaps empty without fabricating volume", () => {
    const candles = observedCandles([[120_000, 10], [180_000, 12], [240_000, 9], [660_000, 15]], "5m");
    expect(candles).toEqual([
      { time: 0, open: 10, high: 12, low: 9, close: 9, volume: 0 },
      { time: 600, open: 15, high: 15, low: 15, close: 15, volume: 0 },
    ]);
  });
});

describe("live trade candles", () => {
  const pool = address("Pool");

  it("draws an open token's GeckoTerminal candles as market cap, with volume in SOL and credit", async () => {
    const store = new TokenStore();
    store.add(priced(50_000, {}, { address: sol, pool, priceUsd: 5e-5 }));
    const book = new ChartBook(async () => minutes(20), () => {}, () => NOW);
    const views = createViews(store, status, [], { charts: book });
    const { chart } = (await views.token(sol))!;
    expect(chart).toMatchObject({ attribution: "geckoterminal", volumeAvailable: true });
    expect(chart.candles["1m"]).toHaveLength(20);
    expect(round(chart.candles["1m"][0])).toEqual({ time: T - 1_200, open: 30_000, high: 30_500, low: 29_500, close: 31_000, volume: 1.5 });
    // 11:40–11:44 and 11:45–11:59, with nothing invented for 11:30–11:39.
    expect(chart.candles["15m"].map((c) => [c.time, c.volume])).toEqual([[T - 1_800, 7.5], [T - 900, 22.5]]);
    expect(round(chart.candles["1D"][0])).toMatchObject({ open: 30_000, close: 50_000, volume: 30 });
  });

  it("keeps the observed history when GeckoTerminal doesn't know the pool", async () => {
    const store = new TokenStore();
    store.add(priced(40_000, {}, { address: sol, pool, mcapSeries: [[NOW - MIN, 39_000], [NOW, 40_000]] }));
    const views = createViews(store, status, [], { charts: new ChartBook(async () => null, () => {}, () => NOW) });
    const { chart } = (await views.token(sol))!;
    expect(chart).toMatchObject({ volumeAvailable: false });
    expect(chart.attribution).toBeUndefined();
    expect(chart.candles["1m"].map((c) => c.close)).toEqual([39_000, 40_000]);
  });

  it("moves the last candle with the newest market cap while the token trades", () => {
    // The last fetched minute is 11:59; a market cap seen at 11:59:40 moves it.
    const token = priced(52_500, { m5: { buys: 3 } }, { address: sol, pool, priceUsd: 5.25e-5, marketAt: NOW - 20 * SEC });
    const view = () => tokenView(token, status, NOW, { charts: { pools: pools({ minute: minutes(20), fetchedAt: NOW - 50 * SEC }) } }).chart.candles["1m"];
    expect(round(view().at(-1)!)).toEqual({ time: T - 60, open: 49_000, high: 52_500, low: 48_500, close: 52_500, volume: 1.5 });
    token.windows.m5.buys = 0;
    expect(round(view().at(-1)!)).toMatchObject({ close: 50_000 });
  });

  it("charts a Pons curve from its own trades, and puts them before the pool once it graduates", () => {
    const pons = newPonsState({ curve: evm, quote: NATIVE_ETH, quoteDecimals: 18, threshold: 10, launchTx: "launch" });
    applyCurveTrade(pons, { buy: true, quote: 1, tokens: 2e8, fee: 0, tax: 0, at: NOW - 30 * MIN });
    const token = priced(56_250, {}, { address: evm, chain: "rh", launchpad: "pons", pons, createdAt: NOW - 30 * MIN });
    const curve = tokenView(token, status, NOW).chart;
    expect(curve).toMatchObject({ volumeAvailable: true });
    expect(curve.attribution).toBeUndefined();
    expect(curve.candles["1m"].map(round)).toEqual([{ time: T - 1_800, open: 12_000, high: 18_750, low: 12_000, close: 18_750, volume: 1 }]);
    Object.assign(token, { graduated: true, pool: `0x${"ab".repeat(32)}`, priceUsd: 5.625e-5 });
    const graduated = tokenView(token, status, NOW, { charts: { pools: pools({ minute: minutes(5) }) } }).chart;
    expect(graduated).toMatchObject({ attribution: "geckoterminal", volumeAvailable: true });
    expect(graduated.candles["1m"].map((c) => c.time)).toEqual([T - 1_800, T - 300, T - 240, T - 180, T - 120, T - 60]);
    expect(graduated.candles["1m"][1].volume).toBeCloseTo(0.05, 9);
  });
});

