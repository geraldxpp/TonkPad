import type { Lane } from "../claude/types";
import type { NewcomerRecord, ScheduledDelete, TrustedRecord } from "./state";
import {
  AI_OFF_REASONS,
  type AiOff,
  type ChatSettings,
  COUNTER_KEYS,
  type CounterKey,
  type OffenceRecord,
  type PendingCheck,
  RULE_CATEGORIES,
  type SpendRecord,
  STRICTNESS_LEVELS,
} from "./types";

/**
 * Readers for the community records (state.ts and records.ts). Each takes an
 * untrusted value, from the file or from a caller, and returns a copy built
 * from its known fields only, or null. What they let through is numbers,
 * booleans, the known enums, UTC days and 16-hex name fingerprints: never
 * free text, names or usernames.
 */

/** A time in ms, or an amount in USD: a finite number, not negative. */
export const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
/** A chat or user ID: a safe integer other than 0 (groups and channels are negative). */
export const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v !== 0;
export const isMessageId = (v: unknown): v is number => isId(v) && v > 0;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** An ID used as a key, written exactly as String(id) writes it (so never "__proto__" or a name). */
export const isIdKey = (key: string): boolean => isId(Number(key)) && String(Number(key)) === key;
/** A name fingerprint: 16 lower-case hex characters. */
export const isFingerprint = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
export const isUtcDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The UTC day of a time, "YYYY-MM-DD", or null when it isn't one. */
export function utcDay(time: number): string | null {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toISOString().slice(0, 10);
  return isUtcDay(day) ? day : null;
}

/** A check's key in the pending map: the group and the newcomer. */
export const pendingKey = (chat: number, user: number): string => `${chat}:${user}`;

export function readSettings(v: unknown): ChatSettings | null {
  if (!isRecord(v)) return null;
  const { paused, proactive, strictness, raidUntil } = v;
  return typeof paused === "boolean" && typeof proactive === "boolean" && oneOf(STRICTNESS_LEVELS, strictness) && isTime(raidUntil)
    ? { paused, proactive, strictness, raidUntil }
    : null;
}

/** An offence record; a reason it doesn't know becomes null, so the count still holds and no text is kept. */
export function readOffence(v: unknown): OffenceRecord | null {
  if (!isRecord(v)) return null;
  const { n, certain, last, category } = v;
  if (!isCount(n) || n === 0 || !isCount(certain) || certain > n || !isTime(last)) return null;
  return { n, certain, last, category: oneOf(RULE_CATEGORIES, category) ? category : null };
}

export function readNewcomer(v: unknown): NewcomerRecord | null {
  if (!isRecord(v)) return null;
  const { passedAt, until } = v;
  return isTime(passedAt) && isTime(until) ? { passedAt, until } : null;
}

export function readTrusted(v: unknown): TrustedRecord | null {
  if (!isRecord(v)) return null;
  const { since, name } = v;
  return isTime(since) && isFingerprint(name) ? { since, name } : null;
}

/** A pending check; its messageId is 0 while the check isn't posted yet. */
export function readPending(v: unknown): PendingCheck | null {
  if (!isRecord(v)) return null;
  const { chat, user, messageId, joinMessageId, deadline, target, tries } = v;
  const ok = isId(chat) && isId(user) && (messageId === 0 || isMessageId(messageId)) && (joinMessageId === null || isMessageId(joinMessageId))
    && isTime(deadline) && (target === null || isCount(target)) && isCount(tries);
  return ok ? { chat, user, messageId, joinMessageId, deadline, target, tries } : null;
}

export function readDelete(v: unknown): ScheduledDelete | null {
  if (!isRecord(v)) return null;
  const { chat, messageId, due, added } = v;
  return isId(chat) && isMessageId(messageId) && isTime(due) && isTime(added) ? { chat, messageId, due, added } : null;
}

/** One day's counters: the known keys with a positive whole count; null when none is left. */
export function readCounts(v: unknown): Partial<Record<CounterKey, number>> | null {
  if (!isRecord(v)) return null;
  const counts: Partial<Record<CounterKey, number>> = {};
  for (const key of COUNTER_KEYS) {
    const n = v[key];
    if (isCount(n) && n > 0) counts[key] = n;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

/** The day's spend per lane (the literal names every lane, so a new one fails the typecheck); a lane missing or malformed counts as 0. */
export function readSpend(v: unknown): SpendRecord | null {
  if (!isRecord(v) || !isUtcDay(v.day) || !isRecord(v.lanes)) return null;
  const lanes = v.lanes;
  const amount = (lane: Lane): number => {
    const usd = lanes[lane];
    return isTime(usd) ? usd : 0;
  };
  return { day: v.day, lanes: { triage: amount("triage"), group: amount("group"), proactive: amount("proactive"), private: amount("private") } };
}

export function readOff(v: unknown): AiOff | null {
  if (!isRecord(v)) return null;
  const { reason, since } = v;
  return oneOf(AI_OFF_REASONS, reason) && isTime(since) ? { reason, since } : null;
}
