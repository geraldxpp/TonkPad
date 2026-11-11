import { dirname, join } from "node:path";
import { parseEther } from "viem";
import { mainnetNetwork, parseTonkMode, testnetNetwork, type MainnetDeployment } from "@/shared/tonk/networks";
import { type Address, lower } from "./types";

/** The watcher's settings, from the worker's environment (Railway variables). */
export interface AlertConfig {
  chainId: number;
  networkName: string;
  explorerUrl: string;
  launchpad: Address;
  migrator: Address;
  /** TONK_POOL_GUARD: the pool guard the migrator must name; null takes the migrator's own. */
  guard: Address | null;
  /** The launchpad's deployment block, where the history starts. */
  startBlock: number;
  rpcUrl: string;
  pollMs: number;
  largeOutflowWei: bigint;
  repeatMs: number;
  maxLagSeconds: number;
  /** Curves at least this far along (basis points) get a graduation dry run. */
  checkFromBps: number;
  /** How often an all-clear summary is sent; 0 never. */
  summaryMs: number;
  heartbeatUrl: string | null;
  telegram: { token: string; chatId: string } | null;
  webhookUrl: string | null;
  /** ALERT_DRY_RUN: alerts are logged, never sent. */
  dryRun: boolean;
  statePath: string;
  /** Values that must never reach a log line, a message or /health. */
  secrets: string[];
}

export interface LoadedAlertConfig {
  config: AlertConfig | null;
  /** What was off or ignored and why, safe to log (never a value from a secret). */
  notes: string[];
}

/** The environment, as plain names and values (process.env in production). */
export type Env = Readonly<Record<string, string | undefined>>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const text = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);
const isUrl = (raw: string) => /^https?:\/\/[^\s]+$/.test(raw);

function number(env: Env, name: string, fallback: number, min: number, max: number, notes: string[]): number {
  const raw = text(env[name]);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= min && value <= max) return value;
  notes.push(`${name} must be a number from ${min} to ${max}; using ${fallback}`);
  return fallback;
}

function ether(env: Env, name: string, fallback: string, notes: string[]): bigint {
  const raw = text(env[name]);
  try {
    if (raw !== null && /^\d+(\.\d{1,18})?$/.test(raw)) return parseEther(raw);
  } catch {
    // Falls through to the default.
  }
  if (raw !== null) notes.push(`${name} must be an amount of ETH such as 0.5; using ${fallback}`);
  return parseEther(fallback);
}

const on = (raw: string | undefined) => ["1", "true", "on", "yes"].includes((raw ?? "").trim().toLowerCase());

/**
 * Reads the watcher's settings. The network and its contracts reuse the
 * app's names: NEXT_PUBLIC_TONK_NETWORK (mainnet or testnet; anything else
 * leaves the watcher off), NEXT_PUBLIC_TONK_LAUNCHPAD, NEXT_PUBLIC_TONK_MIGRATOR
 * and NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK (checked as the app checks them;
 * required on mainnet, the testnet release when none is set on testnet) and
 * TONK_RPC_URL (the network's public RPC when unset).
 */
export function loadAlertConfig(env: Env = process.env): LoadedAlertConfig {
  const notes: string[] = [];
  const off = (why: string): LoadedAlertConfig => ({ config: null, notes: [...notes, `alerts off: ${why}`] });
  const mode = parseTonkMode(env.NEXT_PUBLIC_TONK_NETWORK);
  if (mode !== "mainnet" && mode !== "testnet") return off("NEXT_PUBLIC_TONK_NETWORK is not mainnet or testnet");
  const deployment: MainnetDeployment = {
    launchpad: env.NEXT_PUBLIC_TONK_LAUNCHPAD,
    migrator: env.NEXT_PUBLIC_TONK_MIGRATOR,
    block: env.NEXT_PUBLIC_TONK_LAUNCHPAD_BLOCK,
  };
  // The app's own check of the three values (two distinct addresses and a block), whichever network they're for.
  const named = mainnetNetwork(deployment);
  const anySet = [deployment.launchpad, deployment.migrator, deployment.block].some((value) => text(value) !== null);
  if (anySet && !named) return off("NEXT_PUBLIC_TONK_LAUNCHPAD, _MIGRATOR and _LAUNCHPAD_BLOCK don't make a valid deployment");
  if (mode === "mainnet" && !named) return off("mainnet needs NEXT_PUBLIC_TONK_LAUNCHPAD, _MIGRATOR and _LAUNCHPAD_BLOCK");
  const empty = { poolManager: undefined, universalRouter: undefined, permit2: undefined, quoter: undefined };
  const network = mode === "mainnet" && named ? named : testnetNetwork(deployment, empty);

  const guardRaw = text(env.TONK_POOL_GUARD);
  if (guardRaw !== null && !ADDRESS.test(guardRaw)) notes.push("TONK_POOL_GUARD isn't an address; the migrator's own guard is used");
  const rpcRaw = text(env.TONK_RPC_URL);
  if (rpcRaw !== null && !isUrl(rpcRaw)) return off("TONK_RPC_URL isn't an http(s) URL");

  const token = text(env.ALERT_TELEGRAM_BOT_TOKEN);
  const chatId = text(env.ALERT_TELEGRAM_CHAT_ID);
  if ((token === null) !== (chatId === null)) notes.push("Telegram needs both ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID; it's off");
  const webhookRaw = text(env.ALERT_WEBHOOK_URL);
  if (webhookRaw !== null && !isUrl(webhookRaw)) notes.push("ALERT_WEBHOOK_URL isn't an http(s) URL; it's off");
  const heartbeatRaw = text(env.ALERT_HEARTBEAT_URL);
  if (heartbeatRaw !== null && !isUrl(heartbeatRaw)) notes.push("ALERT_HEARTBEAT_URL isn't an http(s) URL; it's off");

  const snapshot = text(env.SNAPSHOT_PATH) ?? "worker/.state/snapshot.json";
  const config: AlertConfig = {
    chainId: network.chainId,
    networkName: network.name,
    explorerUrl: network.explorerUrl,
    launchpad: lower(network.launchpad),
    migrator: lower(network.migrator),
    guard: guardRaw !== null && ADDRESS.test(guardRaw) ? lower(guardRaw) : null,
    startBlock: network.launchpadBlock,
    rpcUrl: rpcRaw ?? network.rpcUrl,
    pollMs: number(env, "ALERT_POLL_SECONDS", 10, 2, 300, notes) * 1000,
    largeOutflowWei: ether(env, "ALERT_LARGE_OUTFLOW_ETH", "1", notes),
    repeatMs: number(env, "ALERT_REPEAT_MINUTES", 30, 1, 24 * 60, notes) * 60_000,
    maxLagSeconds: number(env, "ALERT_MAX_LAG_SECONDS", 90, 15, 3600, notes),
    checkFromBps: Math.round(number(env, "ALERT_GRADUATION_CHECK_FROM_PCT", 50, 0, 100, notes) * 100),
    summaryMs: number(env, "ALERT_SUMMARY_HOURS", 24, 0, 24 * 7, notes) * 3_600_000,
    heartbeatUrl: heartbeatRaw !== null && isUrl(heartbeatRaw) ? heartbeatRaw : null,
    telegram: token !== null && chatId !== null ? { token, chatId } : null,
    webhookUrl: webhookRaw !== null && isUrl(webhookRaw) ? webhookRaw : null,
    dryRun: on(env.ALERT_DRY_RUN),
    statePath: text(env.ALERT_STATE_PATH) ?? join(dirname(snapshot), `alerts-${network.chainId}.json`),
    secrets: [token, webhookRaw, heartbeatRaw, rpcRaw].filter((value): value is string => value !== null),
  };
  return { config, notes };
}

/** Where alerts go, for the start-up line and /health: never the addresses themselves. */
export function deliveryOf(config: AlertConfig): string {
  if (config.dryRun) return "dry run (logged only)";
  const channels = [config.telegram ? "telegram" : null, config.webhookUrl ? "webhook" : null].filter(Boolean);
  return channels.length > 0 ? channels.join(" + ") : "log only (no channel set)";
}
