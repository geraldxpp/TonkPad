import { type AdminAlert, type AlertKind, ESCALATIONS } from "./types";

/**
 * The alerts that wait in memory (community/alerts.ts): a storm's summary
 * and the digest, each sent as one message at its due time, and the keys
 * that hold back a repeat. Names and excerpts wait here, so each batch's due
 * time is counted from its oldest alert's own creation, never from when it
 * reached the batch.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
/**
 * An alert waits at most this long from when it was raised: names and
 * excerpts stay in memory 10 minutes at most (the privacy page's
 * keeps.memory), and its send may still wait up to 20 seconds in the admin
 * chat's queue.
 */
export const DIGEST_MS = 10 * MINUTE - 30 * SECOND;
/** Alerts a summary or a digest holds at most; past that they are only counted. */
const BATCH_MAX = 200;

export interface Batch {
  items: AdminAlert[];
  /** Alerts past BATCH_MAX: counted, not kept. */
  extra: number;
  /** When it goes out (ms). */
  due: number;
  /** Sends it at its due time whatever the tick does; cleared when it goes. */
  timer: ReturnType<typeof setTimeout> | null;
}

export const newBatch = (): Batch => ({ items: [], extra: 0, due: 0, timer: null });
export const waiting = (batch: Batch): boolean => batch.items.length > 0 || batch.extra > 0;

/**
 * Adds an alert to a batch that must go out by `due`: the first alert sets
 * the batch's time, and a later one only brings it forward (an alert that
 * waited at the admin chat's gate). The timer follows the due time, so the
 * batch goes out then whatever the tick does.
 */
export function hold(batch: Batch, a: AdminAlert, now: number, due: number, send: () => void): void {
  if (!waiting(batch) || due < batch.due) {
    batch.due = due;
    if (batch.timer !== null) clearTimeout(batch.timer);
    const timer = setTimeout(send, Math.max(0, due - now));
    timer.unref?.();
    batch.timer = timer;
  }
  if (batch.items.length < BATCH_MAX) batch.items.push(a);
  else batch.extra += 1;
}

/** Empties a batch for its send: what it held, or null when it held nothing. Its timer is cleared either way. */
export function take(batch: Batch): { items: AdminAlert[]; extra: number } | null {
  if (batch.timer !== null) clearTimeout(batch.timer);
  batch.timer = null;
  if (!waiting(batch)) return null;
  const { items, extra } = batch;
  batch.items = [];
  batch.extra = 0;
  return { items, extra };
}

/** Kinds where each message is a case of its own: a report, an unsure check and every escalation. Two about one member's different messages both alert. */
const PER_MESSAGE: ReadonlySet<AlertKind> = new Set<AlertKind>(["report", ...ESCALATIONS]);

/**
 * What makes two alerts the same case, for the 10-minute repeat rule: the
 * kind, group, member, case and Undo, and for a report, an unsure check or
 * an escalation the message too. Null for an alert that always goes: about
 * nobody in particular, or an admin's control change.
 */
export function repeatKey(a: AdminAlert): string | null {
  const user = a.member?.id;
  if (user === null || user === undefined || a.kind === "control") return null;
  const message = PER_MESSAGE.has(a.kind) && a.messageId !== null ? a.messageId : "";
  return [a.kind, a.chat, user, a.category, a.undo, message].join(":");
}

/** An alert that keeps a message of its own, with its buttons, even in a storm: an Undo, Unmute or Unban, and the raid alert's End raid mode. */
export const ownMessage = (a: AdminAlert): boolean => a.undo !== null || a.kind === "raid";
