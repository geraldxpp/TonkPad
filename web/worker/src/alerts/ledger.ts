import type { ChainEvent } from "./events";
import { type Address, type Contract, ZERO_ADDRESS } from "./types";

const ZERO = BigInt(0);
/** CURVE_SUPPLY: 800M tokens (18 decimals) are sold on each curve. */
const CURVE_SUPPLY = BigInt("800000000000000000000000000");
const BPS = BigInt(10_000);

/** An amount the contract owes, and whether it is the chain's own figure (read, then changed only by events applied since). */
export interface Entry {
  value: bigint;
  verified: boolean;
}

export interface MissionRow extends Entry {
  creator: Address;
  ticker: string;
  graduated: boolean;
  /** Basis points of the curve sold. */
  progressBps: number;
}

/** What a contract owes: ETH in live curves, unclaimed ETH credits, and graduation ETH waiting for a migrator. */
export interface Owed {
  curves: bigint;
  credits: bigint;
  pending: bigint;
  total: bigint;
}

/** A row the chain corrected, and by how much (the chain's figure minus the ledger's). */
export interface Drift {
  key: string;
  delta: bigint;
  /** The row was the chain's own at the last check and changed only through events since: the event model missed. */
  modelled: boolean;
}

export const progressOf = (remaining: bigint) => (remaining >= CURVE_SUPPLY ? 0 : Number(((CURVE_SUPPLY - remaining) * BPS) / CURVE_SUPPLY));

const sum = (values: Iterable<Entry>) => [...values].reduce((total, entry) => total + entry.value, ZERO);

/**
 * Everything the launchpad and the migrator owe, rebuilt from their events
 * (`missions(t).realEthReserves`, `claimableEth`, `pendingGraduationEth`) and
 * corrected from the chain's own views at each check (`solvency.ts`). A row
 * created by its own event (a launch, a first credit) starts as the chain's
 * figure; one first seen any other way doesn't, until it is read.
 */
export class Ledger {
  readonly missions = new Map<Address, MissionRow>();
  readonly credits: Record<Contract, Map<Address, Entry>> = { launchpad: new Map(), migrator: new Map() };
  readonly pending = new Map<Address, Entry>();
  /** Rows events touched since the last check: `mission:`, `credit:launchpad:`, `credit:migrator:` or `pending:` and an address. */
  readonly dirty = new Set<string>();

  private mission(token: Address): MissionRow {
    let row = this.missions.get(token);
    if (!row) {
      // First seen without its launch: its figure isn't the chain's until it is read.
      row = { creator: ZERO_ADDRESS, ticker: "", value: ZERO, verified: false, graduated: false, progressBps: 0 };
      this.missions.set(token, row);
    }
    this.dirty.add(`mission:${token}`);
    return row;
  }

  private credit(contract: Contract, account: Address, delta: bigint): void {
    const entries = this.credits[contract];
    // An account's first credit is complete history (it owed nothing before); a withdrawal first isn't.
    const entry = entries.get(account) ?? { value: ZERO, verified: delta > ZERO };
    entry.value += delta;
    if (entry.value < ZERO) {
      entry.value = ZERO;
      entry.verified = false;
    }
    entries.set(account, entry);
    this.dirty.add(`credit:${contract}:${account}`);
  }

  /** Applies one event; for a graduation, returns the curve's ETH just before it (what the 1.5% fee was taken from). */
  apply(event: ChainEvent): { curveEthBefore: bigint } | null {
    if (event.source === "safe") return null;
    if (event.source === "migrator") {
      if (event.kind === "credited") this.credit("migrator", event.account, event.amount);
      else if (event.kind === "withdrawn") this.credit("migrator", event.account, ZERO - event.amount);
      else if (event.kind === "poolLocked" && (this.pending.get(event.token)?.value ?? ZERO) > ZERO) {
        // executePendingMigration: the waiting ETH went to the migrator.
        this.pending.set(event.token, { value: ZERO, verified: true });
        this.dirty.add(`pending:${event.token}`);
      }
      return null;
    }
    switch (event.kind) {
      case "launched": {
        if (this.missions.has(event.token)) return null;
        this.missions.set(event.token, { creator: event.creator, ticker: event.ticker, value: ZERO, verified: true, graduated: false, progressBps: 0 });
        this.dirty.add(`mission:${event.token}`);
        return null;
      }
      case "trade": {
        // A buy keeps its gross less the three fees (the refund of a capped buy is outside grossEth); a sale pays out its gross.
        const row = this.mission(event.token);
        row.value += event.isBuy ? event.grossEth - event.protocolFee - event.crewFee - event.creatorFee : ZERO - event.grossEth;
        if (row.value < ZERO) {
          row.value = ZERO;
          row.verified = false;
        }
        row.progressBps = progressOf(event.remaining);
        return null;
      }
      case "bundleTax":
        this.mission(event.token).value += event.penaltyEth;
        return null;
      case "graduated": {
        const row = this.mission(event.token);
        const curveEthBefore = row.value;
        row.value = ZERO;
        row.graduated = true;
        row.progressBps = 10_000;
        if (event.pool === ZERO_ADDRESS) {
          const entry = this.pending.get(event.token) ?? { value: ZERO, verified: true };
          this.pending.set(event.token, { value: entry.value + event.ethLiquidity, verified: entry.verified });
          this.dirty.add(`pending:${event.token}`);
        }
        return { curveEthBefore };
      }
      case "credited":
        this.credit("launchpad", event.account, event.amount);
        return null;
      case "withdrawn":
        this.credit("launchpad", event.account, ZERO - event.amount);
        return null;
      default:
        return null;
    }
  }

  owed(contract: Contract): Owed {
    if (contract === "migrator") {
      const credits = sum(this.credits.migrator.values());
      return { curves: ZERO, credits, pending: ZERO, total: credits };
    }
    const curves = sum(this.missions.values());
    const credits = sum(this.credits.launchpad.values());
    const pending = sum(this.pending.values());
    return { curves, credits, pending, total: curves + credits + pending };
  }

  liveMissions(): Address[] {
    return [...this.missions].filter(([, row]) => !row.graduated).map(([token]) => token);
  }

  /** Sets a row to the chain's figure; returns the correction when there was one. */
  correct(key: string, chainValue: bigint, extra?: { progressBps: number; graduated: boolean }): Drift | null {
    const [kind, a, b] = key.split(":");
    const entry: Entry | undefined =
      kind === "mission" ? this.missions.get(a as Address) : kind === "pending" ? this.pending.get(a as Address) : this.credits[a as Contract]?.get(b as Address);
    const before = entry?.value ?? ZERO;
    const modelled = Boolean(entry?.verified) && this.dirty.has(key);
    if (kind === "mission" && entry) Object.assign(entry, extra ?? {});
    if (entry) Object.assign(entry, { value: chainValue, verified: true });
    else if (chainValue > ZERO && kind === "pending") this.pending.set(a as Address, { value: chainValue, verified: true });
    else if (chainValue > ZERO && kind === "credit") this.credits[a as Contract]?.set(b as Address, { value: chainValue, verified: true });
    return chainValue === before ? null : { key, delta: chainValue - before, modelled };
  }
}
