import { LIFTED } from "../community/permissions";
import type { ChatId, UserId } from "../community/types";
import type { TgChatMember, TgChatPermissions } from "../types";

/**
 * A joiner may already be restricted: muted by the bot or by an admin, they
 * left and came back, and Telegram kept the restriction (their records went
 * with the leave). The check must never shorten or lift one that outlasts
 * its own, so it learns what they hold from the chat_member update that
 * reported the join (members.ts notes it here): before the join is handled,
 * or, when the joined message came first, within a second after it (the
 * join waits that long) or later while they are on the check
 * (newcomers-settle.ts).
 */

/** What a joiner holds as they join: when their restriction ends (ms; 0 when there is none, Infinity when it never does) and what it lets them do. */
export interface Held {
  end: number;
  permissions: Required<TgChatPermissions>;
}

/** When the restriction `m` shows ends (ms): Infinity when it never does, 0 when there is none. */
export function restrictionEnd(m: TgChatMember | null | undefined): number {
  if (m?.status !== "restricted") return 0;
  const until = m.until_date;
  // 0 means forever; a missing or odd end is read the same way, so a restriction is never cut short.
  return typeof until === "number" && Number.isFinite(until) && until > 0 ? until * 1_000 : Number.POSITIVE_INFINITY;
}

const KEYS = Object.keys(LIFTED) as Array<keyof TgChatPermissions>;

/** The 16 permissions an answer shows, each named; one it doesn't say is read as not allowed, so a restriction put back is never looser. */
export function permissionsOf(m: TgChatMember | null | undefined): Required<TgChatPermissions> {
  const kept = { ...LIFTED };
  for (const key of KEYS) kept[key] = m?.[key] === true;
  return kept;
}

export const heldOf = (m: TgChatMember | null | undefined): Held => ({ end: restrictionEnd(m), permissions: permissionsOf(m) });

/**
 * Whether what someone holds outlasts the check's restriction ending at
 * `end` (ms), to the second Telegram keeps: the check's own restriction, read
 * back after it was made, never does.
 */
export const outlasts = (held: Held, end: number): boolean => !Number.isFinite(held.end) || Math.floor(held.end / 1_000) > Math.floor(end / 1_000);

/** A held restriction's end as CommunityOut.restore takes it: unix seconds, 0 for never. */
export const endUnix = (end: number): number => (Number.isFinite(end) ? Math.floor(end / 1_000) : 0);

/** What members.ts tells the check about a join it saw in a chat_member update (mod/newcomers.ts implements it). */
export interface HeldSink {
  /** `member` is the joiner as the update shows them now (new_chat_member). */
  noteHeld(chat: ChatId, user: UserId, member: TgChatMember, now: number): void;
}

/** A note is used by the join it came with, within a second or two; past this it is dropped (well inside the privacy page's 10 minutes). */
const NOTE_MS = 2 * 60_000;

export interface HeldNotes {
  /** Hands a note to the join waiting for it (true), or keeps it for one yet to come (false). */
  note(chat: ChatId, user: UserId, held: Held, now: number): boolean;
  /** The kept note, once (the note goes), or undefined when there is none. */
  take(chat: ChatId, user: UserId, now: number): Held | undefined;
  /** The note of a join being handled, kept or within `ms`; undefined when none comes in time. */
  wait(chat: ChatId, user: UserId, ms: number): Promise<Held | undefined>;
  /** Forgets the note, and ends a wait for one: they left. */
  drop(chat: ChatId, user: UserId): void;
  prune(now: number): void;
}

/** What chat_member updates said about joiners' restrictions, kept until their join is handled. Holds chat and user IDs only, for 2 minutes at most. */
export function createHeldNotes(now: () => number = Date.now): HeldNotes {
  const notes = new Map<string, { held: Held; at: number }>();
  const waits = new Map<string, { done: (held: Held | undefined) => void; timer: ReturnType<typeof setTimeout> }>();
  const key = (chat: ChatId, user: UserId) => `${chat}:${user}`;

  function settle(k: string, held: Held | undefined): boolean {
    const w = waits.get(k);
    if (!w) return false;
    waits.delete(k);
    clearTimeout(w.timer);
    w.done(held);
    return true;
  }

  function take(chat: ChatId, user: UserId, at: number): Held | undefined {
    const k = key(chat, user);
    const n = notes.get(k);
    notes.delete(k);
    return n && at - n.at < NOTE_MS ? n.held : undefined;
  }

  return {
    note(chat, user, held, at) {
      const k = key(chat, user);
      if (settle(k, held)) return true;
      notes.set(k, { held, at });
      return false;
    },
    take,
    wait(chat, user, ms) {
      const kept = take(chat, user, now());
      if (kept !== undefined || ms <= 0) return Promise.resolve(kept);
      const k = key(chat, user);
      settle(k, undefined);
      return new Promise((done) => {
        const timer = setTimeout(() => settle(k, undefined), ms);
        timer.unref?.();
        waits.set(k, { done, timer });
      });
    },
    drop(chat, user) {
      const k = key(chat, user);
      notes.delete(k);
      settle(k, undefined);
    },
    prune(at) {
      for (const [k, n] of notes) if (at - n.at >= NOTE_MS) notes.delete(k);
    },
  };
}
