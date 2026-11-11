import { LAUNCHPAD_VIEWS, MIGRATOR_VIEWS } from "./abi";
import { type Alert, type AlertContext, addressLink } from "./alert";
import type { AlertConfig } from "./config";
import type { Drift, Ledger } from "./ledger";
import { balance, Batch, hasCode, view } from "./reads";
import type { AlertRpc } from "./rpc";
import { integrityAlerts, ownersOf, readSettings, type Settings, settingsAlerts } from "./settings";
import { driftAlert, solvencyAlerts } from "./solvency";
import type { WatcherState } from "./state";
import type { Address, Contract } from "./types";

const ZERO = BigInt(0);
/** Rows re-read each check besides those events touched, in rotation, so a missed log can't leave one wrong for long. */
export const RECONCILE_PER_CHECK = 20;

type Position = { id: bigint; initialized: boolean };
type RowValue = { value: bigint; extra?: { progressBps: number; graduated: boolean }; position?: Position } | null;
type Telemetry = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean];

/** How one ledger row is read: a curve's telemetry (and its pool position once graduated), a credit, or waiting graduation ETH. */
function queueRow(batch: Batch, key: string, config: AlertConfig, ledger: Ledger, block: number): () => RowValue {
  const [kind, a, b] = key.split(":");
  if (kind === "mission") {
    const telemetry = batch.add(view(config.launchpad, LAUNCHPAD_VIEWS, "getMissionTelemetry", [a], block, (r) => r as Telemetry));
    const graduated = ledger.missions.get(a as Address)?.graduated === true;
    const locked = graduated ? batch.add(view(config.migrator, MIGRATOR_VIEWS, "lockedPositions", [a], block, (r) => r as readonly unknown[])) : null;
    return () => {
      const t = telemetry();
      const p = locked?.();
      if (!t) return null;
      return { value: t[3], extra: { progressBps: Number(t[2]), graduated: t[7] }, position: p ? { id: p[2] as bigint, initialized: p[8] === true } : undefined };
    };
  }
  const read =
    kind === "pending"
      ? view(config.launchpad, LAUNCHPAD_VIEWS, "pendingGraduationEth", [a], block, (r) => r as bigint)
      : a === "migrator"
        ? view(config.migrator, MIGRATOR_VIEWS, "claimableEth", [b], block, (r) => r as bigint)
        : view(config.launchpad, LAUNCHPAD_VIEWS, "claimableEth", [b], block, (r) => r as bigint);
  const get = batch.add(read);
  return () => {
    const value = get();
    return value === null ? null : { value };
  };
}

/** Every row a full check reads: live curves and any touched since the last check, credits, and waiting graduation ETH. */
export function allRows(ledger: Ledger): string[] {
  return [
    ...[...ledger.missions].filter(([token, row]) => !row.graduated || ledger.dirty.has(`mission:${token}`)).map(([token]) => `mission:${token}`),
    ...(["launchpad", "migrator"] as const).flatMap((c) => [...ledger.credits[c].keys()].map((account) => `credit:${c}:${account}`)),
    ...[...ledger.pending.keys()].map((token) => `pending:${token}`),
  ];
}

/** Graduated tokens must hold a locked, initialized position; graduation ETH must not wait for a migrator. Both last until fixed. */
function poolAlerts(positions: ReadonlyArray<[Address, Position]>, ledger: Ledger, ctx: AlertContext): { alerts: Alert[]; evaluated: string[] } {
  const alerts: Alert[] = [];
  for (const [token, position] of positions) {
    if (position.initialized && position.id > ZERO) continue;
    alerts.push({ key: `pool:${token}`, severity: "critical", condition: true, title: `${ctx.token(token)} graduated without a locked pool position`, lines: ["The migrator holds no initialized position for it, so its pool may have no liquidity.", addressLink(ctx, ctx.migrator)] });
  }
  for (const [token, entry] of ledger.pending) {
    if (entry.value === ZERO) continue;
    alerts.push({ key: `pending:${token}`, severity: "critical", condition: true, title: `Graduation ETH of ${ctx.token(token)} is waiting`, lines: ["It graduated with no migrator; the owner must run executePendingMigration.", addressLink(ctx, ctx.launchpad)] });
  }
  return { alerts, evaluated: [...positions.map(([token]) => `pool:${token}`), ...[...ledger.pending.keys()].map((token) => `pending:${token}`)] };
}

export interface CheckResult {
  alerts: Alert[];
  evaluated: string[];
}

/**
 * One check at `block`, in one batch: both balances and the rows events
 * touched since the last check; with `withSettings` (every 30 s), also every
 * setting and a few more rows in rotation; on the first check, every row.
 * The chain's figures replace the ledger's, and a row it had wrong with no
 * event to explain it (a missed log) moves the surplus baseline with it. A
 * shortfall or a fall in the surplus is confirmed by re-reading every row at
 * the same block before it is raised.
 */
export async function runCheck(rpc: AlertRpc, config: AlertConfig, state: WatcherState, block: number, ctx: AlertContext, rotation: number, codes: Map<Address, boolean>, withSettings = true): Promise<CheckResult> {
  const { ledger } = state;
  const first = state.surplus.launchpad === null || state.settings === null;
  const settled = withSettings || first;
  const every = allRows(ledger);
  const rotating = every.filter((key) => !ledger.dirty.has(key));
  const start = rotating.length > 0 ? rotation % rotating.length : 0;
  const picked = first ? every : [...new Set([...ledger.dirty, ...(settled ? rotating.slice(start, start + RECONCILE_PER_CHECK) : [])])];

  const batch = new Batch();
  const balances = { launchpad: batch.add(balance(config.launchpad, block)), migrator: batch.add(balance(config.migrator, block)) };
  const knownGuard = config.guard ?? (state.settings?.["migrator.initializationGuard"] as Address | undefined) ?? null;
  const settings = settled ? readSettings(batch, config.launchpad, config.migrator, knownGuard, block) : () => state.settings ?? {};
  const queue = (keys: readonly string[], into: Batch) => keys.map((key) => [key, queueRow(into, key, config, ledger, block)] as const);
  const rows = queue(picked, batch);
  await batch.run(rpc);

  // The guard's own views, and whether each owner is a contract (a Safe), once each is known.
  let now: Settings = settings();
  const guard = now["migrator.initializationGuard"];
  const owners = settled ? ownersOf(now).filter((owner) => !codes.has(owner)) : [];
  if ((settled && !knownGuard && /^0x[0-9a-f]{40}$/.test(guard)) || owners.length > 0) {
    const more = new Batch();
    const withGuard = settled && !knownGuard && /^0x[0-9a-f]{40}$/.test(guard) ? readSettings(more, config.launchpad, config.migrator, guard as Address, block) : null;
    const found = owners.map((owner) => [owner, more.add(hasCode(owner, block))] as const);
    await more.run(rpc);
    if (withGuard) now = withGuard();
    for (const [owner, code] of found) codes.set(owner, code());
  }

  const drifts: Drift[] = [];
  const positions: Array<[Address, Position]> = [];
  const apply = (read: ReadonlyArray<readonly [string, () => RowValue]>) => {
    for (const [key, get] of read) {
      const value = get();
      if (!value) continue;
      const drift = ledger.correct(key, value.value, value.extra);
      if (drift) drifts.push(drift);
      if (value.position) positions.push([key.split(":")[1] as Address, value.position]);
    }
  };
  apply(rows);
  const assess = (contract: Contract) => {
    const ours = (d: Drift) => (contract === "migrator" ? d.key.startsWith("credit:migrator:") : !d.key.startsWith("credit:migrator:"));
    const adjust = drifts.filter((d) => !d.modelled && ours(d)).reduce((sum, d) => sum + d.delta, ZERO);
    const baseline = state.surplus[contract];
    return solvencyAlerts({ contract, balance: balances[contract](), owed: ledger.owed(contract), baseline: baseline === null ? null : baseline - adjust, fromBlock: (state.checkedBlock ?? block) + 1, toBlock: block }, ctx);
  };
  let launchpad = assess("launchpad");
  let migrator = assess("migrator");
  if (!first && launchpad.alerts.length + migrator.alerts.length > 0) {
    const pickedSet = new Set(picked);
    const rest = new Batch();
    const more = queue(every.filter((key) => !pickedSet.has(key)), rest);
    await rest.run(rpc);
    apply(more);
    launchpad = assess("launchpad");
    migrator = assess("migrator");
  }

  const integrity = settled ? integrityAlerts(now, config.guard, config.chainId, ctx) : { alerts: [], evaluated: [] };
  const changed = settled ? settingsAlerts(state.settings, now, (state.settingsBlock ?? block) + 1, block, ctx) : [];
  const pools = poolAlerts(positions, ledger, ctx);
  const drift = first ? null : driftAlert(drifts, block, ctx);
  const alerts = [...launchpad.alerts, ...migrator.alerts, ...changed, ...integrity.alerts, ...pools.alerts, ...(drift ? [drift] : [])];

  ledger.dirty.clear();
  if (settled) {
    state.settings = now;
    state.settingsBlock = block;
    state.safes = ownersOf(now).filter((owner) => codes.get(owner) === true);
  }
  state.surplus = { launchpad: launchpad.surplus, migrator: migrator.surplus };
  state.checkedBlock = block;
  return { alerts, evaluated: [...launchpad.evaluated, ...migrator.evaluated, ...integrity.evaluated, ...pools.evaluated] };
}
