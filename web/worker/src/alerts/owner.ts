import { type Alert, type AlertContext, nameOf, short, txLink } from "./alert";
import type { ChainEvent } from "./events";
import { ZERO_ADDRESS } from "./types";

/**
 * Every owner event on either contract, every time: pause and unpause,
 * ownership transfers started and accepted, the migrator being set, Crew
 * exclusions, and the migrator's treasury. Keyed by transaction and log, so
 * each is sent once however often its block is read.
 */
export function ownerEventAlerts(events: readonly ChainEvent[], ctx: AlertContext): Alert[] {
  const alerts: Alert[] = [];
  for (const event of events) {
    if (event.source === "safe") continue;
    const where = event.source === "launchpad" ? "the launchpad" : "the migrator";
    const base = { key: `owner:${event.tx}:${event.logIndex}`, severity: "warning" as const };
    const at = `Block ${event.block}.`;
    const link = txLink(ctx, event.tx);
    switch (event.kind) {
      case "paused":
        alerts.push({ ...base, title: "Launchpad PAUSED", lines: [`Paused by ${short(event.by)}. Launches, buys and sells are refused until it is unpaused. ${at}`, link] });
        break;
      case "unpaused":
        alerts.push({ ...base, title: "Launchpad unpaused", lines: [`Unpaused by ${short(event.by)}. Launches and trading are open again. ${at}`, link] });
        break;
      case "ownershipStarted":
        alerts.push({
          ...base,
          title: `Ownership transfer started on ${where}`,
          lines: [`${short(event.from)} offered ownership to ${event.to}. It moves only when that address accepts. ${at}`, link],
        });
        break;
      case "ownershipTransferred":
        alerts.push({
          ...base,
          severity: event.from === ZERO_ADDRESS ? "info" : "warning",
          title: event.from === ZERO_ADDRESS ? `Ownership of ${where} set at deployment` : event.to === ZERO_ADDRESS ? `Ownership of ${where} renounced` : `Ownership of ${where} changed`,
          lines: [`${event.from === ZERO_ADDRESS ? "Deployed by" : `${short(event.from)} →`} ${event.to}. ${at}`, link],
        });
        break;
      case "migratorSet":
        alerts.push({ ...base, title: "Graduation migrator set", lines: [`The launchpad now graduates into ${nameOf(ctx, event.migrator)} (${event.migrator}). ${at}`, link] });
        break;
      case "crewExcluded":
        alerts.push({ ...base, title: "Owner excluded an address from Crew rewards", lines: [`${event.account} no longer earns Crew rewards on ${ctx.token(event.token)}. ${at}`, link] });
        break;
      case "treasuryUpdated":
        alerts.push({ ...base, title: "Migrator treasury changed", lines: [`Pool fees and graduation remainders now go to ${event.treasury}. ${at}`, link] });
        break;
      default:
        break;
    }
  }
  return alerts;
}
