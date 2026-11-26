import type { ChatId, Records, UserId } from "../community/types";

/**
 * Who left a community group lately, in memory only, for 10 minutes (the
 * privacy page's memory line), so an offence is never recorded for someone
 * who is gone (prompts/15-community-agent.md, What it keeps: "When you
 * leave the group, it deletes your records there"). A late verdict on a
 * message posted before its author left records nothing; a message posted
 * after a rejoin counts as any other. Kept per Records, the store the
 * offences live in, so whoever forgets a member can note it.
 */

const KEEP_MS = 10 * 60_000;
/** A bound, so a mass leave can't grow the map without end. */
const MAX = 20_000;

const lefts = new WeakMap<Records, Map<string, number>>();
const keyOf = (chat: ChatId, user: UserId) => `${chat}:${user}`;

function prune(left: Map<string, number>, now: number): void {
  // Keys go in as they are seen, oldest first, so the sweep stops at the first one still live.
  for (const [key, at] of left) {
    if (now - at < KEEP_MS && left.size <= MAX) break;
    left.delete(key);
  }
}

/** Notes that this member left this group (or was removed) at `now`. */
export function noteLeft(records: Records, chat: ChatId, user: UserId, now: number): void {
  const left = lefts.get(records) ?? new Map<string, number>();
  lefts.set(records, left);
  const key = keyOf(chat, user);
  left.delete(key);
  left.set(key, now);
  prune(left, now);
}

/** Whether this member left this group at or after `since` (the time their message was seen), within the last 10 minutes. */
export function leftSince(records: Records, chat: ChatId, user: UserId, since: number, now: number): boolean {
  const left = lefts.get(records);
  if (!left) return false;
  prune(left, now);
  const at = left.get(keyOf(chat, user));
  return at !== undefined && at >= since && now - at < KEEP_MS;
}
