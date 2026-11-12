import { newTrackedToken } from "../../worker/src/model";
import { newPonsState } from "../../worker/src/pons/curve";
import { startServer } from "../../worker/src/server";
import { TokenStore } from "../../worker/src/store";
import { TonkBook } from "../../worker/src/tonk/book";
import { CONFIRMATIONS, TonkFeed } from "../../worker/src/tonk/feed";
import { createViews } from "../../worker/src/views/cache";
import { CONFIG, FakeRpc, SYSTEM } from "../../worker/tests/tonk-rpc";
import { tonkScenario } from "../../worker/tests/tonk-scenario";
import { TTONE } from "../testnet/fixture-chain";
import { MAINNET_PONS_TOKEN, MAINNET_WORKER_PORT, MAINNET_WORKER_TOKEN } from "../testnet/fixtures";

/**
 * The live-data worker for the mainnet-mode run, with the real tonkfun.fun
 * feed: it follows the feed tests' simulated chain (a launch with its dev
 * lock, curve trades, a wallet-to-wallet transfer, graduation, pool swaps),
 * here as Tonk Test One's, launched 55 minutes ago. No network: the chain is
 * in memory, and ETH is at a made-up $3,000.
 */
const ETH_USD = 3_000;
const store = new TokenStore();
const chain = tonkScenario({ token: TTONE.token as `0x${string}`, name: TTONE.name, symbol: TTONE.symbol, launchTime: Math.floor(Date.now() / 1000) - 55 * 60 });
const rpc = new FakeRpc(chain);
const book = new TonkBook(store, SYSTEM);
const feed = new TonkFeed(rpc, CONFIG, book);

// A Pons token, so a token the launchpad doesn't know still has its own page.
const pons = newTrackedToken({ address: MAINNET_PONS_TOKEN, chain: "rh", launchpad: "pons", name: "Pons Pal", symbol: "PAL", creator: MAINNET_PONS_TOKEN, createdAt: Date.now() - 20 * 60_000, creatorBuyShare: 0, marketCapNative: null }, null);
pons.pons = newPonsState({ curve: MAINNET_PONS_TOKEN, quote: "0x0000000000000000000000000000000000000000", quoteDecimals: 18, threshold: 4.2, launchTx: "fixture" });

async function main(): Promise<void> {
  while ((feed.cursor ?? 0) < rpc.head - CONFIRMATIONS) await feed.poll();
  book.refresh(Date.now(), ETH_USD);
  setInterval(() => book.refresh(Date.now(), ETH_USD), 5_000);
  store.add(pons);
  const views = createViews(store, { solUsd: null, ethUsd: ETH_USD, rhGasGwei: null }, ["tonk", "pons", "pump", "bonk"], { tonk: SYSTEM });
  const server = startServer(MAINNET_WORKER_PORT, MAINNET_WORKER_TOKEN, { ...views, health: () => ({ ok: true, fixture: true }) });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
}

void main();
