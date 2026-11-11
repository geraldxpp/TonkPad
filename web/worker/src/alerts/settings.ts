import { type Abi, formatEther, formatUnits } from "viem";
import { ROBINHOOD_UNISWAP } from "@/shared/tonk/networks";
import { GUARD_VIEWS, LAUNCHPAD_VIEWS, MIGRATOR_VIEWS } from "./abi";
import { type Alert, type AlertContext, addressLink, short } from "./alert";
import { type Batch, one, view } from "./reads";
import type { AlertRpc } from "./rpc";
import { type Address, lower } from "./types";

/** Every owner-set value and contract link, as text: `launchpad.launchFee`, `migrator.owner`, `guard.migrator`… */
export type Settings = Record<string, string>;

const LAUNCHPAD_KEYS = ["owner", "pendingOwner", "paused", "launchFee", "protocolTreasury", "defaultVirtualEth", "defaultVirtualTokens", "graduationMigrator"];
const MIGRATOR_KEYS = ["owner", "pendingOwner", "protocolTreasury", "launchpad", "poolManager", "positionManager", "initializationGuard"];
const GUARD_KEYS = ["migrator", "poolManager"];

/** Uniswap's PositionManager on chain 4663 (Uniswap's deployments catalog, 4 Nov 2026), beside networks.ts's PoolManager. */
const ROBINHOOD_POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";

const asText = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : String(value));

/** Queues every setting at `block`; the getter returns them, or throws if a node couldn't answer. */
export function readSettings(batch: Batch, launchpad: Address, migrator: Address, guard: Address | null, block: number): () => Settings {
  const groups: Array<[string, Address, Abi, string[]]> = [
    ["launchpad", launchpad, LAUNCHPAD_VIEWS, LAUNCHPAD_KEYS],
    ["migrator", migrator, MIGRATOR_VIEWS, MIGRATOR_KEYS],
    ...(guard ? [["guard", guard, GUARD_VIEWS, GUARD_KEYS] as [string, Address, Abi, string[]]] : []),
  ];
  const getters = groups.flatMap(([prefix, to, abi, keys]) => keys.map((key) => [`${prefix}.${key}`, batch.add(view(to, abi, key, [], block, asText))] as const));
  return () => Object.fromEntries(getters.map(([key, get]) => [key, get() ?? "reverted"]));
}

/**
 * Whether this deployment keeps the launch-block tax in the curve (the testnet
 * release before F-1) rather than burning it (the mainnet build): only the
 * F-1/F-2 build answers CREW_ELIGIBLE_FLOOR(). Code can't change, so it is
 * read once, at the head, before any event is applied.
 */
export async function taxIntoCurve(rpc: AlertRpc, launchpad: Address, block: number): Promise<boolean> {
  return (await one(rpc, view(launchpad, LAUNCHPAD_VIEWS, "CREW_ELIGIBLE_FLOOR", [], block, (r) => r as bigint))) === null;
}

const tokens = (raw: string) => `${Number(formatUnits(BigInt(raw), 18)).toLocaleString("en-US")} tokens`;

/** The owner's settings that change without an event, each worded old → new. */
const SILENT: Record<string, { title: string; show: (raw: string) => string }> = {
  "launchpad.launchFee": { title: "Launch fee changed", show: (raw) => `${formatEther(BigInt(raw))} ETH` },
  "launchpad.protocolTreasury": { title: "Launchpad treasury changed", show: (raw) => raw },
  "launchpad.defaultVirtualEth": { title: "Starting ETH reserve for new launches changed", show: (raw) => `${formatEther(BigInt(raw))} ETH` },
  "launchpad.defaultVirtualTokens": { title: "Starting token reserve for new launches changed", show: tokens },
};

/** Owner settings the launchpad changes without an event (setLaunchFee, setProtocolTreasury, the two reserve setters): each change, every time. */
export function settingsAlerts(before: Settings | null, after: Settings, fromBlock: number, toBlock: number, ctx: AlertContext): Alert[] {
  if (!before) return [];
  return Object.entries(SILENT).flatMap(([key, { title, show }]) => {
    if (!(key in before) || before[key] === after[key] || before[key] === "reverted" || after[key] === "reverted") return [];
    return [{
      key: `setting:${key}:${toBlock}`,
      severity: "warning",
      title: `Owner action: ${title.charAt(0).toLowerCase()}${title.slice(1)}`,
      lines: [`${show(before[key])} → ${show(after[key])}, between blocks ${fromBlock} and ${toBlock}.`, "The launchpad logs no event for this setter, so the watcher compared its value.", addressLink(ctx, ctx.launchpad)],
    } satisfies Alert];
  });
}

/**
 * The contracts must point at each other, at the configured guard, and on
 * mainnet at Uniswap's own PoolManager and PositionManager; the guard must be
 * a beforeInitialize-only hook serving this migrator. Each mismatch is a
 * lasting critical condition.
 */
export function integrityAlerts(s: Settings, configuredGuard: Address | null, chainId: number, ctx: AlertContext): { alerts: Alert[]; evaluated: string[] } {
  const problems: Array<[string, string, string]> = [];
  const guard = s["migrator.initializationGuard"];
  if (s["launchpad.graduationMigrator"] !== ctx.migrator) problems.push(["migrator-link", "The launchpad graduates into another migrator", `graduationMigrator() is ${s["launchpad.graduationMigrator"]}, not ${ctx.migrator}.`]);
  if (s["migrator.launchpad"] !== ctx.launchpad) problems.push(["launchpad-link", "The migrator serves another launchpad", `launchpad() is ${s["migrator.launchpad"]}, not ${ctx.launchpad}.`]);
  if (configuredGuard && guard !== configuredGuard) problems.push(["guard", "The migrator uses another pool guard", `initializationGuard() is ${guard}, not TONK_POOL_GUARD ${configuredGuard}.`]);
  const flags = /^0x[0-9a-f]{40}$/.test(guard) ? BigInt(guard) & BigInt(0x3fff) : null;
  if (flags !== BigInt(0x2000)) problems.push(["guard-flags", "The pool guard isn't a beforeInitialize-only hook", `${guard} has hook flags other than beforeInitialize.`]);
  if ("guard.migrator" in s && (s["guard.migrator"] !== ctx.migrator || s["guard.poolManager"] !== s["migrator.poolManager"])) {
    problems.push(["guard-links", "The pool guard serves another migrator or PoolManager", `It names migrator ${s["guard.migrator"]} and PoolManager ${s["guard.poolManager"]}.`]);
  }
  if (chainId === 4663 && (s["migrator.poolManager"] !== ROBINHOOD_UNISWAP.poolManager || s["migrator.positionManager"] !== ROBINHOOD_POSITION_MANAGER)) {
    problems.push(["uniswap", "The migrator isn't on Uniswap's own contracts", `PoolManager ${s["migrator.poolManager"]}, PositionManager ${s["migrator.positionManager"]}.`]);
  }
  const keys = ["migrator-link", "launchpad-link", "guard", "guard-flags", "guard-links", "uniswap"].map((key) => `integrity:${key}`);
  const alerts = problems.map(([key, title, line]) => ({ key: `integrity:${key}`, severity: "critical" as const, condition: true, title, lines: [line, addressLink(ctx, key === "launchpad-link" ? ctx.migrator : ctx.launchpad)] }));
  return { alerts, evaluated: keys };
}

/** The owners and pending owners of both contracts, without the zero address. */
export function ownersOf(s: Settings): Address[] {
  const all = ["launchpad.owner", "launchpad.pendingOwner", "migrator.owner", "migrator.pendingOwner"].map((key) => s[key]).filter((v): v is string => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v));
  return [...new Set(all.map(lower))].filter((a) => a !== "0x0000000000000000000000000000000000000000");
}

export const describeOwner = (s: Settings) => `owner ${short(s["launchpad.owner"] ?? "?")}${s["launchpad.pendingOwner"] && s["launchpad.pendingOwner"] !== "0x0000000000000000000000000000000000000000" ? `, pending ${short(s["launchpad.pendingOwner"])}` : ""}`;
