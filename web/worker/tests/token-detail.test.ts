import { describe, expect, it } from "vitest";
import { newPonsState } from "../src/pons/curve";
import { TokenStore } from "../src/store";
import { createViews } from "../src/views/cache";
import { findTrackedToken, tokenView, validTokenAddress } from "../src/views/token";
import { observedCandles } from "../src/views/token-chart";
import { MIN, NOW, priced, tracked } from "./fixtures";

const status = { solUsd: 100, ethUsd: 3_000, rhGasGwei: null };
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

  it("prioritizes selected tokens for the existing metadata and holder refresh loops", () => {
    const store = new TokenStore();
    store.add(tracked({ address: sol, marketCap: 0 }));
    const views = createViews(store, status, []);
    expect(views.token("missing")).toBeNull();
    expect(views.token(sol)?.contract).toBe(sol);
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
