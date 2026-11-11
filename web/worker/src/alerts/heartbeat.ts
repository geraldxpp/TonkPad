import { type Alert, eth, plain, short } from "./alert";
import { type AlertConfig, deliveryOf } from "./config";
import type { Owed } from "./ledger";
import type { WatcherState } from "./state";
import type { Address } from "./types";

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/** The watcher is reading blocks more than ALERT_MAX_LAG_SECONDS behind the chain. */
export function lagAlert(lagSeconds: number, maxLagSeconds: number, cursor: number, head: number): Alert | null {
  if (lagSeconds <= maxLagSeconds) return null;
  return {
    key: "lag",
    severity: "critical",
    condition: true,
    title: "Watcher is behind the chain",
    lines: [`It has read to block ${cursor}, ${head - cursor} blocks (about ${Math.round(lagSeconds)} s) behind the head at ${head}. Alerts arrive late until it catches up.`],
  };
}

/** No cycle has succeeded for ALERT_MAX_LAG_SECONDS: the watcher can't see the chain. */
export function stallAlert(sinceMs: number, lastError: string | null): Alert {
  return {
    key: "stalled",
    severity: "critical",
    condition: true,
    title: "Watcher has stopped reading the chain",
    lines: [`No successful check for ${minutes(sinceMs)} min.${lastError ? ` Last error: ${plain(lastError)}.` : ""} Nothing on chain is being watched until it recovers.`],
  };
}

/** The RPC's head hasn't moved: the sequencer, or the RPC, is stuck. */
export function headStuckAlert(head: number, sinceMs: number): Alert {
  return {
    key: "head-stuck",
    severity: "warning",
    condition: true,
    title: "The chain's head isn't moving",
    lines: [`The RPC has reported block ${head} for ${minutes(sinceMs)} min: the sequencer or the RPC is stuck.`],
  };
}

export interface Snapshot {
  block: number;
  balances: { launchpad: bigint; migrator: bigint };
  owed: { launchpad: Owed; migrator: Owed };
  live: number;
  nearGraduation: number;
  graduated: number;
  paused: boolean;
  owner: string;
  ownerIsSafe: boolean;
  delivery: string;
}

/** The state after a check, for a summary: each balance is what was owed plus the surplus over it. */
export function snapshotOf(state: WatcherState, nearBps: number, codes: ReadonlyMap<Address, boolean>, delivery: string): Snapshot {
  const { ledger, settings } = state;
  const rows = [...ledger.missions.values()];
  const owed = { launchpad: ledger.owed("launchpad"), migrator: ledger.owed("migrator") };
  const owner = settings?.["launchpad.owner"] ?? "";
  return {
    block: state.cursor ?? 0,
    balances: { launchpad: owed.launchpad.total + (state.surplus.launchpad ?? BigInt(0)), migrator: owed.migrator.total + (state.surplus.migrator ?? BigInt(0)) },
    owed,
    live: rows.filter((row) => !row.graduated).length,
    nearGraduation: rows.filter((row) => !row.graduated && row.progressBps >= nearBps).length,
    graduated: rows.filter((row) => row.graduated).length,
    paused: settings?.["launchpad.paused"] === "true",
    owner,
    ownerIsSafe: codes.get(owner as Address) === true,
    delivery,
  };
}

/** The start-up message and the periodic all-clear, so a quiet channel can't hide a dead watcher. */
export function summaryAlert(kind: "startup" | "summary", s: Snapshot, now: number, how: string): Alert {
  return {
    key: `${kind}:${now}`,
    severity: "info",
    title: kind === "startup" ? "Launchpad watcher started" : "Launchpad watcher: all quiet",
    lines: [
      ...(kind === "startup" ? [`${how}, now at block ${s.block}. Alerts go to: ${s.delivery}.`] : [`Checked to block ${s.block}.`]),
      `Launchpad holds ${eth(s.balances.launchpad)} and owes ${eth(s.owed.launchpad.total)}; the migrator holds ${eth(s.balances.migrator)} and owes ${eth(s.owed.migrator.total)}.`,
      `${s.live} live curves (${s.nearGraduation} near graduation), ${s.graduated} graduated. ${s.paused ? "PAUSED." : "Not paused."}`,
      `Owner ${short(s.owner)}${s.ownerIsSafe ? " (a contract: its transactions are read too)" : ""}.`,
    ],
  };
}

/** The watcher's block in the worker's public /health: positions and times only, never a setting or a secret. */
export function healthOf(config: AlertConfig, state: WatcherState, live: { head: number | null; rebuilding: boolean; lastCheckAt: number | null; unsent: number }): Record<string, unknown> {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return {
    enabled: true,
    chainId: config.chainId,
    lastBlock: state.cursor,
    headBlock: live.head,
    lagBlocks: live.head !== null && state.cursor !== null ? Math.max(0, live.head - state.cursor) : null,
    rebuilding: live.rebuilding,
    lastCheckAt: iso(live.lastCheckAt),
    lastAlertAt: iso(state.dispatch.lastAlertAt),
    activeAlerts: Object.keys(state.dispatch.active).length,
    unsentMessages: live.unsent,
    delivery: deliveryOf(config),
  };
}
