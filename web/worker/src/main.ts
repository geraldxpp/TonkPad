import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LiveList, LiveListQuery, LiveOverview, LiveShell, LiveStatus } from "@/shared/types/live";
import type { LaunchpadId } from "@/shared/types/launchpad";
import { loadConfig, log } from "./config";
import type { TrackedToken } from "./model";
import { startServer } from "./server";
import { BATCH_SIZE, fetchMarket, RateLimitError } from "./sources/dexscreener";
import { ASSET_BATCH, fetchAssets } from "./sources/helius";
import { fetchGasGwei, fetchNativePrices } from "./sources/prices";
import { connectPumpPortal } from "./sources/pumpportal";
import { TokenStore } from "./store";
import { listView } from "./views/list";
import { overviewView } from "./views/overview";
import { shellView } from "./views/shell";

/** Launchpads the worker ingests today (Robinhood Chain and the other Solana ones come next). */
const INGESTING: readonly LaunchpadId[] = ["pump", "bonk"];

/**
 * Helius lookups (art, names, mint and freeze authority) go out as one batch
 * a minute. Each call costs 10 credits however many tokens it carries, so this
 * caps the worker at about 432K credits a month (the free plan has 1M).
 */
const ASSET_LOOKUP_EVERY = 60_000;

const config = loadConfig();
const store = new TokenStore();
const status: LiveStatus = { solUsd: null, ethUsd: null, rhGasGwei: null };
const startedAt = Date.now();
let lastLaunchAt = 0;
let marketBackoffUntil = 0;
/** Helius calls since start, reported by /health to watch the credit budget. */
let heliusCalls = 0;

/** Views are recomputed at most once a second; the app caches them for 2 s on top. */
function memo<T>(compute: () => T): () => T {
  let at = 0;
  let value: T | null = null;
  return () => {
    const now = Date.now();
    if (value === null || now - at >= 1_000) {
      value = compute();
      at = now;
    }
    return value;
  };
}
const overview = memo<LiveOverview>(() => overviewView(store.all(), INGESTING, Date.now()));
const shell = memo<LiveShell>(() => shellView(store.all(), { ...status }, Date.now()));
const lists = new Map<string, { at: number; value: LiveList }>();
function list(query: LiveListQuery): LiveList {
  const key = JSON.stringify(query);
  const now = Date.now();
  const hit = lists.get(key);
  if (hit && now - hit.at < 1_000) return hit.value;
  const value = listView(store.all(), query, now);
  lists.set(key, { at: now, value });
  if (lists.size > 500) lists.clear();
  return value;
}

/** Tokens someone is likely to see, so their art loads first. */
function visibleAddresses(): Set<string> {
  const seen = new Set<string>();
  const base = { chain: "all", pad: "all", q: "", limit: 30 } as const;
  for (const tab of ["trending", "new", "graduating", "graduated", "gainers"] as const) {
    for (const row of list({ ...base, tab, tf: "24h" }).rows) seen.add(row.address);
  }
  const o = overview();
  o.heating.forEach((c) => seen.add(c.token.address));
  o.blips.forEach((b) => seen.add(b.address));
  if (o.missionPick) seen.add(o.missionPick.token.address);
  shell().tape.forEach((t) => seen.add(t.address));
  return seen;
}

async function refreshMarkets(): Promise<void> {
  const now = Date.now();
  if (now < marketBackoffUntil) return;
  const due = store.dueForRefresh("sol", now, BATCH_SIZE);
  if (due.length === 0) return;
  try {
    const data = await fetchMarket("solana", due);
    for (const { address } of due) store.applyMarket(address, data.get(address), Date.now());
  } catch (error) {
    if (error instanceof RateLimitError) marketBackoffUntil = Date.now() + 30_000;
    log("dexscreener", error instanceof Error ? error.message : "request failed");
  }
}

async function refreshAssets(): Promise<void> {
  if (!config.heliusApiKey) return;
  const ids = store.needingAssets("sol", visibleAddresses(), ASSET_BATCH, Date.now());
  if (ids.length === 0) return;
  try {
    heliusCalls += 1;
    const info = await fetchAssets(config.heliusApiKey, ids);
    for (const id of ids) store.applyAsset(id, info.get(id), Date.now());
  } catch (error) {
    log("helius", error instanceof Error ? error.message : "request failed");
  }
}

async function refreshStatus(): Promise<void> {
  try {
    if (config.jupiterApiKey) Object.assign(status, await fetchNativePrices(config.jupiterApiKey));
    if (config.robinhoodRpcUrl) status.rhGasGwei = await fetchGasGwei(config.robinhoodRpcUrl);
  } catch (error) {
    log("status", error instanceof Error ? error.message : "request failed");
  }
}

async function saveSnapshot(): Promise<void> {
  await mkdir(dirname(config.snapshotPath), { recursive: true });
  const tmp = `${config.snapshotPath}.tmp`;
  await writeFile(tmp, JSON.stringify(store.toJSON()));
  await rename(tmp, config.snapshotPath);
}

async function loadSnapshot(): Promise<void> {
  try {
    const tokens = JSON.parse(await readFile(config.snapshotPath, "utf8")) as TrackedToken[];
    store.restore(tokens, Date.now());
    log("worker", `restored ${store.size} tokens`);
  } catch {
    log("worker", "no snapshot yet; starting fresh");
  }
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
  await loadSnapshot();
  await refreshStatus();
  connectPumpPortal({
    onLaunch: (event) => {
      if (store.addLaunch(event, status.solUsd)) lastLaunchAt = event.createdAt;
    },
    onGraduation: (event) => store.markGraduated(event),
  });
  every(400, refreshMarkets);
  every(ASSET_LOOKUP_EVERY, refreshAssets);
  every(20_000, refreshStatus);
  every(60_000, async () => {
    const removed = store.prune(Date.now());
    await saveSnapshot();
    log("worker", `${store.size} tokens tracked, ${removed} pruned`);
  });

  startServer(config.port, config.workerToken, {
    list,
    overview,
    shell,
    health: () => ({
      ok: true,
      tokens: store.size,
      lastLaunchAt,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      heliusCalls,
    }),
  });
  log("worker", `listening on :${config.port}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void saveSnapshot().finally(() => process.exit(0));
    });
  }
}

void start();
