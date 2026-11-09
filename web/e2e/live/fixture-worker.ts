import { emptyWindows, newTrackedToken, type TrackedToken } from "../../worker/src/model";
import { newPonsState } from "../../worker/src/pons/curve";
import { startServer } from "../../worker/src/server";
import { TokenStore } from "../../worker/src/store";
import { createViews } from "../../worker/src/views/cache";
import { FIXTURE_WORKER_TOKEN, FRESH_ADDRESS, LIVE_ROBINHOOD, LIVE_SOLANA } from "./fixtures";

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

store.add(observedToken(LIVE_SOLANA));
const robinhood = observedToken(LIVE_ROBINHOOD);
robinhood.pons = newPonsState({
  curve: LIVE_ROBINHOOD.address, quote: "0x0000000000000000000000000000000000000000",
  quoteDecimals: 18, threshold: 10, launchTx: "fixture-transaction",
});
robinhood.pons.balances = { [LIVE_ROBINHOOD.address]: 100_000_000 };
store.add(robinhood);
store.add(newTrackedToken({
  address: FRESH_ADDRESS, name: "Fresh Launch", symbol: "FRESH", chain: "sol", launchpad: "pump",
  creator: FRESH_ADDRESS, createdAt: now, creatorBuyShare: 0, marketCapNative: null,
}, null));

const views = createViews(store, { solUsd: 100, ethUsd: 3_000, rhGasGwei: null }, ["pump", "pons"]);
const server = startServer(8788, FIXTURE_WORKER_TOKEN, { ...views, health: () => ({ ok: true, fixture: true }) });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
