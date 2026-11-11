import { ChartBook, type FetchCandles } from "../../worker/src/charts/book";
import { emptyWindows, newTrackedToken, type TrackedToken } from "../../worker/src/model";
import { newPonsState } from "../../worker/src/pons/curve";
import { startServer } from "../../worker/src/server";
import { TokenStore } from "../../worker/src/store";
import { newTradeBook, recordTrades } from "../../worker/src/trades/book";
import { createViews } from "../../worker/src/views/cache";
import type { RawCandle } from "../../worker/src/sources/geckoterminal";
import { FIXTURE_TRADERS, FIXTURE_WORKER_TOKEN, FRESH_ADDRESS, LIVE_ROBINHOOD, LIVE_SOLANA, LIVE_SOLANA_POOL } from "./fixtures";

const now = Date.now();
const minute = 60_000;
const store = new TokenStore();

function observedToken(input: typeof LIVE_SOLANA | typeof LIVE_ROBINHOOD): TrackedToken {
  const token = newTrackedToken({
    ...input,
    creator: input.address,
    createdAt: now - 45 * minute,
    creatorBuyShare: 0,
    marketCapNative: null,
  }, null);
  const windows = emptyWindows();
  for (const window of Object.values(windows)) Object.assign(window, { volume: 12_345, buys: 24, sells: 7, change: 8.2 });
  return {
    ...token, windows, priceUsd: input.marketCap / 1e9, marketCap: input.marketCap,
    marketAt: now, liquidityUsd: 6_000, supply: 1e15, decimals: 6, curve: 0.7,
    holderCount: 42, top10Share: 0.1, mintRevoked: true, freezeRevoked: true,
    holderBalances: [{ owner: input.address, amount: 1e14 }],
    mcapSeries: Array.from({ length: 11 }, (_, i) => [now - (10 - i) * 3 * minute, input.marketCap - (10 - i) * 100]),
  };
}

store.add({ ...observedToken(LIVE_SOLANA), pool: LIVE_SOLANA_POOL });
const robinhood = observedToken(LIVE_ROBINHOOD);
robinhood.pons = newPonsState({
  curve: LIVE_ROBINHOOD.address, quote: "0x0000000000000000000000000000000000000000",
  quoteDecimals: 18, threshold: 10, launchTx: "fixture-transaction",
});
robinhood.pons.balances = { [LIVE_ROBINHOOD.address]: 100_000_000 };
// Curve trades as the Pons feed records them: one wallet buys and sells at a profit, another only buys.
const [first, second] = FIXTURE_TRADERS;
const curveTrade = (n: number, side: "buy" | "sell", wallet: string, tokens: number, eth: number) => ({
  id: `0x${String(n).padStart(64, "0")}:${side}`, tx: `0x${String(n).padStart(64, "0")}`, at: now - (4 - n) * minute,
  side, wallet, tokens, native: eth, usd: eth * 3_000, marketCap: 41_200,
});
robinhood.pons.book = newTradeBook();
recordTrades(robinhood.pons.book, [
  curveTrade(1, "buy", first, 1_000_000, 0.01),
  curveTrade(2, "buy", second, 2_000_000, 0.02),
  curveTrade(3, "sell", first, 1_000_000, 0.015),
]);
store.add(robinhood);
store.add(newTrackedToken({
  address: FRESH_ADDRESS, name: "Fresh Launch", symbol: "FRESH", chain: "sol", launchpad: "pump",
  creator: FRESH_ADDRESS, createdAt: now, creatorBuyShare: 0, marketCapNative: null,
}, null));

/** 90 minutes of trades for LIVE_SOLANA's pool, closing this minute at its market cap, $150 a minute (no network). */
const fixtureCandles: FetchCandles = async (request) => {
  if (request.pool !== LIVE_SOLANA_POOL) return null;
  const end = Math.floor(Date.now() / minute) * 60;
  return Array.from({ length: 90 }, (_, i): RawCandle => {
    const close = (LIVE_SOLANA.marketCap - (89 - i) * 50) / 1e9;
    const open = close - 50 / 1e9;
    return [end - (89 - i) * 60, open, close + 20 / 1e9, open - 20 / 1e9, close, 150];
  });
};

const views = createViews(store, { solUsd: 100, ethUsd: 3_000, rhGasGwei: null }, ["pump", "pons"], { charts: new ChartBook(fixtureCandles) });
const server = startServer(8788, FIXTURE_WORKER_TOKEN, { ...views, health: () => ({ ok: true, fixture: true }) });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
