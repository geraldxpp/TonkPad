import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type DispatchState, emptyDispatchState } from "./dispatcher";
import { type Entry, Ledger, type MissionRow } from "./ledger";
import type { Settings } from "./settings";
import type { Address, Contract } from "./types";

/** Everything the watcher carries across restarts. */
export interface WatcherState {
  /** The last block whose logs are applied; null before the first read. */
  cursor: number | null;
  /** The block of the last check (balances), the start of the next check's range. */
  checkedBlock: number | null;
  /** The block the settings were last read at. */
  settingsBlock: number | null;
  ledger: Ledger;
  settings: Settings | null;
  /** Each contract's surplus over what it owed at the last check. */
  surplus: Record<Contract, bigint | null>;
  dispatch: DispatchState;
  /** Owners that are contracts (Safes), whose logs are read too. */
  safes: Address[];
  lastSummaryAt: number | null;
}

export const freshState = (): WatcherState => ({
  cursor: null,
  checkedBlock: null,
  settingsBlock: null,
  ledger: new Ledger(),
  settings: null,
  surplus: { launchpad: null, migrator: null },
  dispatch: emptyDispatchState(),
  safes: [],
  lastSummaryAt: null,
});

/** Which deployment a state file belongs to: one for another is never resumed. */
export interface Deployment {
  chainId: number;
  launchpad: Address;
  migrator: Address;
}

type EntryJSON = { value: string; verified: boolean };
const entryJSON = (entry: Entry): EntryJSON => ({ value: entry.value.toString(), verified: entry.verified });
const entryOf = (json: EntryJSON): Entry => ({ value: BigInt(json.value), verified: json.verified === true });
const bigOrNull = (value: unknown) => (typeof value === "string" ? BigInt(value) : null);

export function serializeState(state: WatcherState, deployment: Deployment): string {
  const { ledger } = state;
  return JSON.stringify({
    version: 1,
    ...deployment,
    cursor: state.cursor,
    checkedBlock: state.checkedBlock,
    settingsBlock: state.settingsBlock,
    missions: [...ledger.missions].map(([token, row]) => [token, { ...row, value: row.value.toString() }]),
    credits: { launchpad: [...ledger.credits.launchpad].map(([a, e]) => [a, entryJSON(e)]), migrator: [...ledger.credits.migrator].map(([a, e]) => [a, entryJSON(e)]) },
    pending: [...ledger.pending].map(([token, e]) => [token, entryJSON(e)]),
    dirty: [...ledger.dirty],
    settings: state.settings,
    surplus: { launchpad: state.surplus.launchpad?.toString() ?? null, migrator: state.surplus.migrator?.toString() ?? null },
    dispatch: state.dispatch,
    safes: state.safes,
    lastSummaryAt: state.lastSummaryAt,
  });
}

/** A saved state, or null when it is unreadable or for another deployment (the watcher then rebuilds from the deployment block). */
export function parseState(text: string, deployment: Deployment): WatcherState | null {
  try {
    const raw = JSON.parse(text);
    if (raw?.version !== 1 || raw.chainId !== deployment.chainId || raw.launchpad !== deployment.launchpad || raw.migrator !== deployment.migrator) return null;
    if (typeof raw.cursor !== "number") return null;
    const ledger = new Ledger();
    for (const [token, row] of raw.missions as Array<[Address, MissionRow & { value: string }]>) ledger.missions.set(token, { ...row, value: BigInt(row.value) });
    for (const contract of ["launchpad", "migrator"] as const) {
      for (const [account, entry] of raw.credits[contract] as Array<[Address, EntryJSON]>) ledger.credits[contract].set(account, entryOf(entry));
    }
    for (const [token, entry] of raw.pending as Array<[Address, EntryJSON]>) ledger.pending.set(token, entryOf(entry));
    for (const key of raw.dirty as string[]) ledger.dirty.add(key);
    return {
      cursor: raw.cursor,
      checkedBlock: typeof raw.checkedBlock === "number" ? raw.checkedBlock : null,
      settingsBlock: typeof raw.settingsBlock === "number" ? raw.settingsBlock : null,
      ledger,
      settings: raw.settings ?? null,
      surplus: { launchpad: bigOrNull(raw.surplus?.launchpad), migrator: bigOrNull(raw.surplus?.migrator) },
      dispatch: { ...emptyDispatchState(), ...raw.dispatch },
      safes: Array.isArray(raw.safes) ? raw.safes : [],
      lastSummaryAt: typeof raw.lastSummaryAt === "number" ? raw.lastSummaryAt : null,
    };
  } catch {
    return null;
  }
}

export async function loadState(path: string, deployment: Deployment): Promise<WatcherState | null> {
  try {
    return parseState(await readFile(path, "utf8"), deployment);
  } catch {
    return null;
  }
}

/** Written to a temporary file first, so a crash mid-write never leaves a broken state. */
export async function saveState(path: string, state: WatcherState, deployment: Deployment): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, serializeState(state, deployment));
  await rename(tmp, path);
}
