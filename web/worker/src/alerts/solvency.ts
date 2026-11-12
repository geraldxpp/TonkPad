import { type Alert, type AlertContext, addressLink, eth } from "./alert";
import type { Drift, Owed } from "./ledger";
import type { Address, Contract } from "./types";

const ZERO = BigInt(0);

export interface SolvencyCheck {
  contract: Contract;
  balance: bigint;
  owed: Owed;
  /** The surplus at the last check (balance less what was owed), less the corrections to rows it counted wrongly; null on the first check. */
  baseline: bigint | null;
  /** The blocks since the last check. */
  fromBlock: number;
  toBlock: number;
}

/**
 * Solvency. A contract's ETH balance must cover what it owes; and since
 * every wei that leaves either contract also leaves its own accounting (a
 * sale, a fee, a withdrawal, a graduation) and both refuse plain transfers
 * in (the migrator takes them, as a gift), the surplus over what is owed can
 * never fall. A shortfall is a lasting condition; a fall in the surplus is
 * ETH that left with nothing on chain to account for it.
 */
export function solvencyAlerts(check: SolvencyCheck, ctx: AlertContext): { alerts: Alert[]; surplus: bigint; evaluated: string[] } {
  const { contract, balance, owed } = check;
  const surplus = balance - owed.total;
  const address = contract === "launchpad" ? ctx.launchpad : ctx.migrator;
  const name = contract === "launchpad" ? "Launchpad" : "Migrator";
  const parts =
    contract === "launchpad"
      ? `${eth(owed.curves)} in live curves, ${eth(owed.credits)} in unclaimed ETH credits, ${eth(owed.pending)} waiting for a migrator`
      : `${eth(owed.credits)} in unclaimed ETH credits`;
  const alerts: Alert[] = [];
  if (surplus < ZERO) {
    alerts.push({
      key: `solvency:${contract}`,
      severity: "critical",
      condition: true,
      title: `${name} is short of ETH`,
      lines: [`It holds ${eth(balance)} but owes ${eth(owed.total)}: ${parts}.`, `Short by ${eth(ZERO - surplus)} at block ${check.toBlock}.`, addressLink(ctx, address)],
    });
  }
  if (check.baseline !== null && surplus < check.baseline) {
    alerts.push({
      key: `unexplained:${contract}:${check.toBlock}`,
      severity: "critical",
      title: `ETH left the ${contract} with nothing to account for it`,
      lines: [
        `${eth(check.baseline - surplus)} left the ${contract} between blocks ${check.fromBlock} and ${check.toBlock} without a sale, fee, withdrawal or graduation to explain it.`,
        `It now holds ${eth(balance)} and owes ${eth(owed.total)}.`,
        addressLink(ctx, address),
      ],
    });
  }
  return { alerts, surplus, evaluated: [`solvency:${contract}`] };
}

/** Rows the watcher had wrong, which the chain's own figures corrected: a missed log, or an event it read differently from the contract. */
export function driftAlert(drifts: readonly Drift[], toBlock: number, ctx: AlertContext): Alert | null {
  if (drifts.length === 0) return null;
  const describe = (drift: Drift) => {
    const [kind, a, b] = drift.key.split(":");
    const what = kind === "mission" ? `curve of ${ctx.token(a as Address)}` : kind === "pending" ? `graduation ETH of ${ctx.token(a as Address)}` : `${a}'s credit to ${b}`;
    const sign = drift.delta > ZERO ? "+" : "";
    return `${what}: ${sign}${eth(drift.delta)}${drift.modelled ? " (after events the watcher read)" : ""}`;
  };
  return {
    key: `drift:${toBlock}`,
    severity: "warning",
    title: "The watcher's ledger disagreed with the chain",
    lines: [
      `Corrected from the contracts' own figures at block ${toBlock}; solvency is checked against those.`,
      ...drifts.slice(0, 5).map(describe),
      ...(drifts.length > 5 ? [`and ${drifts.length - 5} more`] : []),
    ],
  };
}
