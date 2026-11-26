import type { CommunityStateFile } from "./state";
import { isId, utcDay } from "./state-check";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long each record is kept: what the bot's privacy page states. */
export const RETENTION = {
  /** Offences count until 7 days after the last. */
  offences: 7 * DAY,
  /**
   * A check is kept until 5 minutes after its deadline, when the newcomer's
   * restriction ends too, so the tick can still remove someone whose check
   * ran out while it was busy or the worker was down. A check not yet posted
   * has its deadline carried forward while the bot tries to post it, 30
   * minutes at most (mod/newcomers-wait.ts): 45 minutes in all, then 15 at
   * most once it is posted.
   */
  checkGrace: 5 * MINUTE,
  /** The privacy page's limit for a check from any moment: one whose deadline would keep it longer (none is ever set so far ahead) is dropped. */
  checkMax: 15 * MINUTE,
  /** A new member's first days are 7 at most (strict mode), counted from passing the check. */
  newcomerMax: 7 * DAY,
  /** A review request, for a day. */
  appeal: DAY,
  /** Telegram lets a bot delete a message for 48 hours, so a delete is never kept longer than that from when it was scheduled. */
  deletes: 48 * HOUR,
  /** Counters: today and yesterday (UTC). */
  day: DAY,
} as const;

/** Per group, per member, keyed by the IDs as strings. */
export type PerMember<T> = Record<string, Record<string, T>>;

export const getMember = <T>(map: PerMember<T>, chat: number, user: number): T | undefined => map[String(chat)]?.[String(user)];

/** Sets one member's entry; false (and nothing kept) when the chat or user isn't an ID. */
export function putMember<T>(map: PerMember<T>, chat: number, user: number, value: T): boolean {
  if (!isId(chat) || !isId(user)) return false;
  const members = map[String(chat)] ?? (map[String(chat)] = {});
  members[String(user)] = value;
  return true;
}

/** Deletes one member's entry, and the group's map once it is empty; true when there was one. */
export function dropMember<T>(map: PerMember<T>, chat: number, user: number): boolean {
  const members = map[String(chat)];
  if (members?.[String(user)] === undefined) return false;
  delete members[String(user)];
  if (Object.keys(members).length === 0) delete map[String(chat)];
  return true;
}

/** Deletes every entry `expired` says has run out (it sees the inner key too); true when any was. */
function sweep<T>(map: PerMember<T>, expired: (value: T, key: string) => boolean): boolean {
  let changed = false;
  for (const [chat, entries] of Object.entries(map)) {
    for (const [key, value] of Object.entries(entries)) {
      if (!expired(value, key)) continue;
      delete entries[key];
      changed = true;
    }
    if (Object.keys(entries).length === 0) delete map[chat];
  }
  return changed;
}

/**
 * Drops from `state` whatever has outlived its retention at `now`: offences
 * 7 days after the last; newcomers when their first days end (7 days after
 * passing at most); checks 5 minutes after their deadline (never more than
 * 15 minutes ahead), and the check message with the last of them; reviews
 * after a day; the bot's messages to delete 48 hours after
 * they were scheduled; counters older than yesterday (UTC); the spend of
 * another day. Trusted members stay until an admin removes them or they
 * leave. True when anything was dropped.
 */
export function pruneState(state: CommunityStateFile, now: number): boolean {
  const today = utcDay(now);
  const yesterday = utcDay(now - RETENTION.day);
  if (!today || !yesterday) return false;
  let changed = false;
  const posted: Array<{ chat: number; messageId: number; deadline: number }> = [];
  for (const [key, check] of Object.entries(state.pending)) {
    const end = check.deadline + RETENTION.checkGrace;
    if (now < end && end - now <= RETENTION.checkMax) continue;
    delete state.pending[key];
    if (check.messageId > 0) posted.push(check);
    changed = true;
  }
  forgetChecks(state, posted, now);
  const deletes = state.deletes.filter((d) => now - d.added < RETENTION.deletes);
  if (deletes.length < state.deletes.length) {
    state.deletes = deletes;
    changed = true;
  }
  if (state.spend && state.spend.day !== today) {
    state.spend = null;
    changed = true;
  }
  const swept = [
    sweep(state.warnings, (w) => now - w.last >= RETENTION.offences),
    sweep(state.newcomers, (n) => n.until <= now || now - n.passedAt >= RETENTION.newcomerMax),
    sweep(state.appeals, (at) => now - at >= RETENTION.appeal),
    sweep(state.counters, (_counts, day) => day !== today && day !== yesterday),
  ];
  return changed || swept.includes(true);
}

/**
 * A check message whose last newcomer's record went past its time (the
 * worker was down past the grace) is deleted too, as the tick would have
 * deleted it, after a restart as well. Telegram lets a bot delete its own
 * message for 48 hours from posting, at most 10 minutes before the deadline;
 * the delete's 48 hours count from 15 minutes before it.
 */
function forgetChecks(state: CommunityStateFile, gone: ReadonlyArray<{ chat: number; messageId: number; deadline: number }>, now: number): void {
  for (const { chat, messageId, deadline } of gone) {
    const on = (d: { chat: number; messageId: number }) => d.chat === chat && d.messageId === messageId;
    if (Object.values(state.pending).some(on) || state.deletes.some(on)) continue;
    state.deletes.push({ chat, messageId, due: now, added: Math.max(0, deadline - RETENTION.checkMax) });
  }
}

/**
 * Drops every member's records in the groups `allowed` doesn't list (one
 * taken off TELEGRAM_COMMUNITY_CHATS, or dropped by a failed setup check):
 * offences, newcomers, trusted members, review requests and checks. A
 * group's settings and day counts hold no IDs and stay, in case it comes
 * back; so do the bot's own messages to delete. True when anything went.
 */
export function dropChatsExcept(state: CommunityStateFile, allowed: readonly number[]): boolean {
  const keep = new Set(allowed.map((chat) => String(chat)));
  return dropChats(state, (chat) => !keep.has(chat));
}

/** Drops every member's records in one group (the bot is no longer in it), as dropChatsExcept does for a group no longer listed. True when anything went. */
export function dropChat(state: CommunityStateFile, chat: number): boolean {
  return dropChats(state, (key) => key === String(chat));
}

/** Drops the per-member records and checks of each group `gone` names (by its ID as a string). */
function dropChats(state: CommunityStateFile, gone: (chat: string) => boolean): boolean {
  const maps: Array<Record<string, unknown>> = [state.warnings, state.newcomers, state.trusted, state.appeals];
  let changed = false;
  for (const map of maps) {
    for (const chat of Object.keys(map)) {
      if (!gone(chat)) continue;
      delete map[chat];
      changed = true;
    }
  }
  for (const [key, check] of Object.entries(state.pending)) {
    if (!gone(String(check.chat))) continue;
    delete state.pending[key];
    changed = true;
  }
  return changed;
}
