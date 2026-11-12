import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TrackedToken } from "./model";
import type { SmartWalletsJSON } from "./smart/wallets";

/** What the worker saves every minute and on shutdown, so a restart carries on. */
export interface Snapshot {
  tokens: TrackedToken[];
  /** The last Robinhood Chain block the Pons feed read. */
  ponsBlock: number | null;
  /** Smart money's graduates and wallet credits (30 days). */
  smart?: SmartWalletsJSON | null;
  /** The tonkfun.fun feed: the launchpad it followed and the last block it applied. */
  tonk?: { launchpad: string; cursor: number | null } | null;
}

/** Reads a snapshot; version 1 was a bare array of tokens. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as unknown;
  if (Array.isArray(raw)) return { tokens: raw as TrackedToken[], ponsBlock: null };
  const s = (raw ?? {}) as Partial<Snapshot>;
  return {
    tokens: Array.isArray(s.tokens) ? s.tokens : [],
    ponsBlock: typeof s.ponsBlock === "number" ? s.ponsBlock : null,
    smart: s.smart ?? null,
    ...(s.tonk && typeof s.tonk.launchpad === "string" ? { tonk: { launchpad: s.tonk.launchpad, cursor: typeof s.tonk.cursor === "number" ? s.tonk.cursor : null } } : {}),
  };
}

export async function loadSnapshot(path: string): Promise<Snapshot | null> {
  try {
    return parseSnapshot(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/** Written to a temporary file first, so a crash mid-write never leaves a broken snapshot. */
export async function saveSnapshot(path: string, snapshot: Snapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot));
  await rename(tmp, path);
}
