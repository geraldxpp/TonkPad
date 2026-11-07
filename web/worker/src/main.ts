import type { ChainId } from "@/shared/types/chain";
import type { LaunchpadId } from "@/shared/types/launchpad";
import type { LiveStatus } from "@/shared/types/live";
import { loadConfig, log } from "./config";
import { PonsBook } from "./pons/book";
import { PonsFeed } from "./pons/feed";
import { startServer } from "./server";
import { loadSnapshot, saveSnapshot } from "./snapshot";
import { BATCH_SIZE, fetchMarket, RateLimitError } from "./sources/dexscreener";
import { ASSET_BATCH, fetchAssets } from "./sources/helius";
import { NATIVE_ETH, USDG, WETH } from "./sources/pons";
import { fetchGasGwei, fetchNativePrices, fetchQuotePrices } from "./sources/prices";
import { connectPumpPortal } from "./sources/pumpportal";
import { RobinhoodRpc } from "./sources/robinhood";
import { createSafetyChecks } from "./safety";
import { TokenStore } from "./store";
import { createViews } from "./views/cache";

/** Launchpads the worker ingests today, in the order the radar names them. */
const INGESTING: readonly LaunchpadId[] = ["pons", "pump", "bonk"];

/**
 * Helius lookups (art, names, mint and freeze authority) go out as one batch
 * a minute. Each call costs 10 credits however many tokens it carries, so this
 * stays near 432K credits a month; holder checks (safety.ts) add at most
 * ~260K, inside the free plan's 1M.
 */
const ASSET_LOOKUP_EVERY = 60_000;
/** Pons is read from Robinhood Chain's logs this often (the screen refreshes every 4 s). */
const PONS_POLL_EVERY = 3_000;

const config = loadConfig();
const store = new TokenStore();
const pons = new PonsBook(store);
const ponsFeed = new PonsFeed(new RobinhoodRpc(config.robinhoodLogsRpcUrl), pons);
const status: LiveStatus = { solUsd: null, ethUsd: null, rhGasGwei: null };
const views = createViews(store, status, INGESTING);
/** USD prices of the other assets Pons launches are paired with (tokenized stocks). */
const quotePrices = new Map<string, number>();
const startedAt = Date.now();
let lastLaunchAt = 0;
let marketBackoffUntil = 0;
let quotesFetchedAt = 0;
/** Helius calls and estimated credits since start, reported by /health to watch the budget. */
let heliusCalls = 0;
let heliusCredits = 0;

const lastFailure = new Map<string, number>();
/** Logs a failure at most once a minute per source, so a flaky feed can't flood the logs. */
function fail(scope: string, error: unknown): void {
  const now = Date.now();
  if (now - (lastFailure.get(scope) ?? 0) < 60_000) return;
  lastFailure.set(scope, now);
  log(scope, error instanceof Error ? error.message : "request failed");
}

function quoteUsd(quote: string): number | null {
  if (quote === NATIVE_ETH || quote === WETH) return status.ethUsd;
  if (quote === USDG) return 1;
  return quotePrices.get(quote) ?? null;
}

/** DexScreener: Solana tokens, and Pons tokens once they have graduated. */
async function refreshMarkets(chain: ChainId): Promise<void> {
  const now = Date.now();
  if (now < marketBackoffUntil) return;
  const due = store.dueForRefresh(chain, now, BATCH_SIZE);
  if (due.length === 0) return;
  try {
    const data = await fetchMarket(chain === "sol" ? "solana" : "robinhood", due);
    for (const { address } of due) store.applyMarket(address, data.get(address), Date.now());
  } catch (error) {
    if (error instanceof RateLimitError) marketBackoffUntil = Date.now() + 30_000;
    fail("dexscreener", error);
  }
}

async function refreshQuotePrices(force: boolean): Promise<void> {
  const quotes = [...pons.quotes()].filter((q) => q !== NATIVE_ETH && q !== WETH && q !== USDG);
  const missing = quotes.some((q) => !quotePrices.has(q));
  if (quotes.length === 0 || (!force && !missing) || Date.now() - quotesFetchedAt < 30_000) return;
  quotesFetchedAt = Date.now();
  try {
    for (const [quote, price] of await fetchQuotePrices(quotes)) quotePrices.set(quote, price);
  } catch (error) {
    fail("quotes", error);
  }
}

async function pollPons(): Promise<void> {
  try {
    const { launches } = await ponsFeed.poll();
    if (launches > 0) lastLaunchAt = Date.now();
  } catch (error) {
    fail("pons", error);
  }
  await refreshQuotePrices(false);
  pons.refresh(Date.now(), quoteUsd);
}

async function refreshAssets(): Promise<void> {
  if (!config.heliusApiKey) return;
  const ids = store.needingAssets("sol", views.visibleAddresses(), ASSET_BATCH, Date.now());
  if (ids.length === 0) return;
  try {
    heliusCalls += 1;
    heliusCredits += 10;
    const info = await fetchAssets(config.heliusApiKey, ids);
    for (const id of ids) store.applyAsset(id, info.get(id), Date.now());
  } catch (error) {
    fail("helius", error);
  }
}

async function refreshStatus(): Promise<void> {
  try {
    if (config.jupiterApiKey) Object.assign(status, await fetchNativePrices(config.jupiterApiKey));
    if (config.robinhoodRpcUrl) status.rhGasGwei = await fetchGasGwei(config.robinhoodRpcUrl);
  } catch (error) {
    fail("status", error);
  }
}

const safety = createSafetyChecks({
  store,
  visible: () => views.visibleAddresses(),
  heliusApiKey: config.heliusApiKey,
  jupiterApiKey: config.jupiterApiKey,
  onHeliusCall: () => {
    heliusCalls += 1;
    heliusCredits += 1;
  },
  fail,
});

const save = () => saveSnapshot(config.snapshotPath, { tokens: store.toJSON(), ponsBlock: ponsFeed.cursor });

async function restore(): Promise<void> {
  const snapshot = await loadSnapshot(config.snapshotPath);
  if (!snapshot) return log("worker", "no snapshot yet; starting fresh");
  store.restore(snapshot.tokens, Date.now());
  pons.reindex();
  ponsFeed.cursor = snapshot.ponsBlock;
  log("worker", `restored ${store.size} tokens`);
}

/** Runs `task` every `ms`, never overlapping itself. */
function every(ms: number, task: () => Promise<void>): void {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  }, ms);
}

async function start(): Promise<void> {
  await restore();
  await refreshStatus();
  connectPumpPortal({
    onLaunch: (event) => {
      if (store.addLaunch(event, status.solUsd)) lastLaunchAt = event.createdAt;
    },
    onGraduation: (event) => store.markGraduated(event),
  });
  every(400, () => refreshMarkets("sol"));
  every(2_000, () => refreshMarkets("rh"));
  every(PONS_POLL_EVERY, pollPons);
  every(5 * 60_000, () => refreshQuotePrices(true));
  every(ASSET_LOOKUP_EVERY, refreshAssets);
  every(60_000, safety.refreshHolders);
  every(60_000, safety.verifyIssuers);
  every(30_000, safety.refreshHolderCounts);
  every(20_000, refreshStatus);
  every(60_000, async () => {
    const removed = store.prune(Date.now());
    pons.reindex();
    await save();
    log("worker", `${store.size} tokens tracked (${pons.quotes().size} Pons quote assets), ${removed} pruned`);
  });

  startServer(config.port, config.workerToken, {
    list: views.list,
    overview: views.overview,
    shell: views.shell,
    health: () => ({
      ok: true,
      tokens: store.size,
      lastLaunchAt,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      heliusCalls,
      heliusCredits,
      ponsBlock: ponsFeed.cursor,
    }),
  });
  log("worker", `listening on :${config.port}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void save().finally(() => process.exit(0));
    });
  }
}

void start();
