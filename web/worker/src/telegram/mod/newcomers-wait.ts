import type { ChatId, Records, UserId } from "../community/types";

/**
 * Newcomers waiting for a check that hasn't gone out (the group's message
 * budget is full, or Telegram refused it). They stay restricted while the
 * post is tried again every 15 seconds, for 30 minutes at most: each one's
 * record (message ID 0) and restriction are carried forward in 10-minute
 * steps, a minute before the record's deadline, so neither runs out while
 * the bot is still trying, and a restart leaves a record the tick resolves.
 * The record's deadline is always 5 minutes before the restriction's end,
 * and never more than 10 minutes ahead (the privacy page's 15 minutes for a
 * check, 45 in all when posting it was delayed: 30 waiting, then the
 * check's 10 and its 5).
 */

/** A check that didn't go out is tried again this long after. */
export const RETRY_MS = 15_000;
/** How long a check is tried for, from when it opened; past it, everyone on it is let in text only, marked new (newcomers-steps.ts). */
export const WAIT_MAX_MS = 30 * 60_000;
/** Each step's length, and how close to the record's deadline it is taken. */
const STEP_MS = 10 * 60_000;
const STEP_MARGIN_MS = 60_000;
/** A newcomer's restriction ends this long after their deadline, so a lost state file never leaves anyone restricted. */
export const GRACE_MS = 5 * 60_000;
/** A check that went out late restricts again whoever's restriction would end within this long of their new deadline. */
const MIN_GRACE_MS = 2 * 60_000;

/** The longest a newcomer's record and restriction may last from when the check opened: 30 minutes waiting, then the check's own time and its 5 (the privacy page's 45). */
export const MAX_HELD_MS = 45 * 60_000;

/** A posted check's deadline: its own time from now, but never so late that the record outlives MAX_HELD_MS from when the check opened. */
export const deadlineFor = (opened: number, now: number, durationMs: number): number => Math.min(now + durationMs, opened + MAX_HELD_MS - GRACE_MS);

/** Restricts a newcomer again until `until` (ms), in their line. */
export type Extend = (chat: ChatId, user: UserId, until: number) => void;

/** One waiting newcomer's record carried a step forward when its deadline is a minute off and the check is still being tried; true when it was. */
export function stepWaiting(records: Records, extend: Extend, chat: ChatId, user: UserId, opened: number, now: number): boolean {
  const r = records.pending(chat, user);
  if (!r || r.messageId !== 0 || r.deadline - now > STEP_MARGIN_MS || now >= opened + WAIT_MAX_MS) return false;
  const deadline = now + STEP_MS;
  records.setPending({ ...r, deadline });
  extend(chat, user, deadline + GRACE_MS);
  return true;
}

/** Whether a newcomer put on a check now still has a restriction that outlasts its new deadline: it ends 5 minutes after the old one. */
export const stillCovered = (oldDeadline: number, newDeadline: number): boolean => oldDeadline + GRACE_MS >= newDeadline + MIN_GRACE_MS;
