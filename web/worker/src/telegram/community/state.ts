import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  isIdKey,
  isRecord,
  isTime,
  isUtcDay,
  pendingKey,
  readCounts,
  readDelete,
  readNewcomer,
  readOff,
  readOffence,
  readPending,
  readSettings,
  readSpend,
  readTrusted,
} from "./state-check";
import type { AiOff, ChatId, ChatSettings, CounterKey, OffenceRecord, PendingCheck, SpendRecord } from "./types";

/** A new member in their first days: when they passed the check, and when those days end (ms). */
export interface NewcomerRecord {
  passedAt: number;
  until: number;
}

/** A trusted member: since when (ms), and a fingerprint of the name they had then (16 hex). */
export interface TrustedRecord {
  since: number;
  name: string;
}

/** One of the bot's own messages to delete: when it is due, and when it was scheduled (ms), for the 48-hour limit. */
export interface ScheduledDelete {
  chat: ChatId;
  messageId: number;
  due: number;
  added: number;
}

/**
 * community.json on the worker's volume (community/records.ts reads and
 * changes it). Keys are chat and user IDs as strings ("chat:user" for a
 * check, a UTC day for counters); values are numbers, booleans, the known
 * enums and 16-hex name fingerprints only: no text, names, usernames, chat
 * history, wallet addresses or questions.
 */
export interface CommunityStateFile {
  v: 1;
  /** The day's AI spending per lane (no IDs). */
  spend: SpendRecord | null;
  /** The AI-off switch: an owner's /ai off, or a billing or not-found stop. */
  off: AiOff | null;
  /** Per group: its settings once an owner or raid mode changed them; until then the defaults apply. */
  chats: Record<string, ChatSettings>;
  /** Per group, per UTC day ("YYYY-MM-DD"): today's and yesterday's numbers. */
  counters: Record<string, Record<string, Partial<Record<CounterKey, number>>>>;
  /** Per group, per member: offences, until 7 days after the last. */
  warnings: Record<string, Record<string, OffenceRecord>>;
  newcomers: Record<string, Record<string, NewcomerRecord>>;
  /** Per "chat:user": a check in progress, until 5 minutes after its deadline (when the newcomer's restriction ends too). */
  pending: Record<string, PendingCheck>;
  trusted: Record<string, Record<string, TrustedRecord>>;
  /** Per group, per member: when they last asked for a review (ms), for a day. */
  appeals: Record<string, Record<string, number>>;
  deletes: ScheduledDelete[];
}

export const emptyCommunityState = (): CommunityStateFile => ({
  v: 1, spend: null, off: null, chats: {}, counters: {}, warnings: {}, newcomers: {}, pending: {}, trusted: {}, appeals: {}, deletes: [],
});

/** The entries of `raw` whose key passes `keyOk` and whose value `read` accepts, each as `read` returns it. */
function byKey<T>(raw: unknown, read: (value: unknown) => T | null, keyOk: (key: string) => boolean = isIdKey): Record<string, T> {
  const kept: Record<string, T> = {};
  if (!isRecord(raw)) return kept;
  for (const [key, value] of Object.entries(raw)) {
    const v = keyOk(key) ? read(value) : null;
    if (v !== null) kept[key] = v;
  }
  return kept;
}

const filled = <T>(map: Record<string, T>): Record<string, T> | null => (Object.keys(map).length > 0 ? map : null);
const perMember = <T>(raw: unknown, read: (value: unknown) => T | null) => byKey(raw, (members) => filled(byKey(members, read)));
const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);

/** A whole file checked: anything malformed, and every key it doesn't know, is dropped. */
function checkState(raw: unknown): CommunityStateFile {
  const state = emptyCommunityState();
  if (!isRecord(raw) || raw.v !== 1) return state;
  state.spend = readSpend(raw.spend);
  state.off = readOff(raw.off);
  state.chats = byKey(raw.chats, readSettings);
  state.counters = byKey(raw.counters, (days) => filled(byKey(days, readCounts, isUtcDay)));
  state.warnings = perMember(raw.warnings, readOffence);
  state.newcomers = perMember(raw.newcomers, readNewcomer);
  state.trusted = perMember(raw.trusted, readTrusted);
  state.appeals = perMember(raw.appeals, (at) => (isTime(at) ? at : null));
  for (const value of Object.values(isRecord(raw.pending) ? raw.pending : {})) {
    const check = readPending(value);
    if (check) state.pending[pendingKey(check.chat, check.user)] = check;
  }
  for (const value of list(raw.deletes)) {
    const entry = readDelete(value);
    if (entry) state.deletes.push(entry);
  }
  return state;
}

/** The saved records, or an empty state when the file is missing, unreadable or from another version. */
export async function loadCommunityState(path: string): Promise<CommunityStateFile> {
  try {
    return checkState(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return emptyCommunityState();
  }
}

/** Saves under way, per path: each waits for the one before, so two never write the temporary file at once. */
const saving = new Map<string, Promise<void>>();

/**
 * Checked again (so nothing but the fields above reaches the disk), written
 * whole to a temporary file readable by the worker only, then renamed over
 * the old one, so a crash never leaves half a file. Saves to one path run
 * in call order, each with the state as it was when called. It rejects when
 * the write fails: the caller logs that and saves again with the next change.
 */
export async function saveCommunityState(path: string, state: CommunityStateFile): Promise<void> {
  const json = JSON.stringify(checkState(state));
  const write = (saving.get(path) ?? Promise.resolve()).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, json, { mode: 0o600 });
    await rename(tmp, path);
  });
  const settled = write.then(() => undefined, () => undefined);
  saving.set(path, settled);
  try {
    await write;
  } finally {
    if (saving.get(path) === settled) saving.delete(path);
  }
}
