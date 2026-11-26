import type { Locale } from "@/shared/i18n/config";
import type { ChatId, Strictness, UserId } from "../community/types";
import type { ModDeps } from "./actions";
import { createCheckEdits, type Refresh } from "./newcomers-edits";
import { type Posted, postCheck } from "./newcomers-post";
import { deadlineFor, GRACE_MS, RETRY_MS, stepWaiting, stillCovered, type Extend, WAIT_MAX_MS } from "./newcomers-wait";

export { GRACE_MS } from "./newcomers-wait";
export type { Posted } from "./newcomers-post";

/**
 * The check messages: everyone who joins within 20 seconds of the first
 * shares one, posted once (newcomers-post.ts; one that didn't go out is
 * tried again for 30 minutes: newcomers-wait.ts), edited as members come and
 * go (newcomers-edits.ts) and deleted with the last. Each newcomer's time
 * counts from when they are put on a posted check. Who is pending lives in
 * the records, from the moment they are restricted (message ID 0 until their
 * check is out); this keeps what only matters while the process runs: the
 * open batch, who waits for a check not yet out, which check a member is on
 * (so a leave still finds it once their records are gone), who was just let
 * in or removed, and who is being looked at as they join.
 */

export interface Waiting {
  user: UserId;
  joinMessageId: number | null;
}

export interface Check {
  chat: ChatId;
  opened: number;
  /** The number to tap on a hard check, or null for the one-button check. */
  target: number | null;
  durationMs: number;
  replyTo: number | null;
  messageId: number | null;
  /** When it went out (ms), or null. */
  postedAt: number | null;
  /** After a send that didn't go out, when it is tried again. */
  retryAt: number | null;
  /** The send under way: whoever joins meanwhile waits for it. */
  posting: Promise<void> | null;
  /** Restricted, waiting for the check to go out. */
  waiting: Waiting[];
}

const BATCH_MS = 20_000;
/** How long a tap from someone just let in or removed is answered without a word. */
const DONE_MS = 2 * 60_000;

export interface BoardDeps extends Pick<ModDeps, "out" | "records" | "words" | "now" | "log"> {
  groupLang: Locale;
  strictness: (chat: ChatId) => Strictness;
  /** Restricts a newcomer again, in their line: their check went out late, or they still wait for it. */
  extend: Extend;
}

export function createBoard(deps: BoardDeps) {
  const { records } = deps;
  const checks: Check[] = [];
  const onCheck = new Map<string, { messageId: number; until: number }>();
  const done = new Map<string, { messageId: number; until: number }>();
  const arriving = new Map<string, number>();
  let claims = 0;
  const slot = (chat: ChatId, user: UserId) => `${chat}:${user}`;
  const drop = (check: Check) => {
    const i = checks.indexOf(check);
    if (i >= 0) checks.splice(i, 1);
  };
  const known = (chat: ChatId, messageId: number) => checks.find((c) => c.chat === chat && c.messageId === messageId);
  const open = (chat: ChatId, now: number): Check | null => checks.find((c) => c.chat === chat && now - c.opened < BATCH_MS) ?? null;
  const edits: Refresh = createCheckEdits({
    ...deps,
    durationOf: (chat, messageId) => known(chat, messageId)?.durationMs ?? null,
    gone: (chat, messageId) => {
      const check = known(chat, messageId);
      if (check) drop(check);
    },
  });
  /** Only a posted check has a message to edit or delete. */
  const refresh: Refresh = (chat, messageId) => {
    if (messageId > 0) edits(chat, messageId);
  };
  /** Who still waits for this check: on it, and their record not gone (left, trusted, the group dropped) nor on a check already. */
  const waitingOn = (check: Check) => check.waiting.filter((w) => records.pending(check.chat, w.user)?.messageId === 0);

  /** Puts a member on a posted check: their time starts now, and a restriction that would end too soon after it is made again. False when their record went meanwhile. */
  function pend(check: Check, w: Waiting, messageId: number, now: number): boolean {
    const before = records.pending(check.chat, w.user);
    if (!before) return false;
    const deadline = deadlineFor(check.opened, now, check.durationMs);
    records.setPending({ chat: check.chat, user: w.user, messageId, joinMessageId: w.joinMessageId, deadline, target: check.target, tries: 0 });
    if (!stillCovered(before.deadline, deadline)) deps.extend(check.chat, w.user, deadline + GRACE_MS);
    onCheck.set(slot(check.chat, w.user), { messageId, until: deadline + GRACE_MS });
    records.count(check.chat, "checked", now);
    return true;
  }

  return {
    /** The check a join at `now` would share (opened within 20 seconds), if any. */
    open,
    /** The check a join now shares, or a new one. */
    batch(chat: ChatId, now: number, make: () => Pick<Check, "target" | "durationMs" | "replyTo">): Check {
      const shared = open(chat, now);
      if (shared) return shared;
      const check: Check = { chat, opened: now, messageId: null, postedAt: null, retryAt: null, posting: null, waiting: [], ...make() };
      checks.push(check);
      return check;
    },

    /** Whether this member is already on a check (pending, posted or not, or being looked at as they join). */
    has: (chat: ChatId, user: UserId): boolean => arriving.has(slot(chat, user)) || records.pending(chat, user) !== null,

    /** Marks a member as being looked at as they join; a leave meanwhile ends the claim. */
    claim(chat: ChatId, user: UserId): number {
      claims += 1;
      arriving.set(slot(chat, user), claims);
      return claims;
    },
    claimed: (chat: ChatId, user: UserId, claim: number): boolean => arriving.get(slot(chat, user)) === claim,
    release(chat: ChatId, user: UserId, claim: number): void {
      if (arriving.get(slot(chat, user)) === claim) arriving.delete(slot(chat, user));
    },

    /** Writes a joiner's record as they are restricted (message ID 0 until their check is out), so a restart never loses them. */
    arrive(chat: ChatId, user: UserId, joinMessageId: number | null, until: number): void {
      records.setPending({ chat, user, messageId: 0, joinMessageId, deadline: until - GRACE_MS, target: null, tries: 0 });
    },

    /** Puts a restricted joiner on a check: at once when it is out (its next edit names them), else with those waiting for it. False when their record went meanwhile. */
    join(check: Check, w: Waiting, now: number): boolean {
      const r = records.pending(check.chat, w.user);
      if (!r) return false;
      if (check.messageId === null) {
        records.setPending({ ...r, target: check.target });
        check.waiting.push(w);
      } else if (pend(check, w, check.messageId, now)) refresh(check.chat, check.messageId);
      return true;
    },

    refresh,
    /** Posts a check for everyone waiting on it (newcomers-post.ts). */
    post: (check: Check): Promise<Posted> => postCheck(deps, { pend, refresh, drop, waitingOn }, check),

    /** Takes a member off every check; the posted check message they were on, when known. */
    forget(chat: ChatId, user: UserId): number | null {
      const key = slot(chat, user);
      const recorded = records.pending(chat, user)?.messageId ?? 0;
      const messageId = recorded > 0 ? recorded : (onCheck.get(key)?.messageId ?? null);
      records.dropPending(chat, user);
      onCheck.delete(key);
      arriving.delete(key);
      for (const c of checks) if (c.chat === chat) c.waiting = c.waiting.filter((w) => w.user !== user);
      return messageId;
    },

    /** A member just let in or removed from this check: another tap of theirs is answered without a word. */
    markDone(chat: ChatId, user: UserId, messageId: number, now: number): void {
      done.set(slot(chat, user), { messageId, until: now + DONE_MS });
    },
    wasDone: (chat: ChatId, user: UserId, messageId: number, now: number): boolean => {
      const entry = done.get(slot(chat, user));
      return entry !== undefined && entry.messageId === messageId && entry.until > now;
    },

    /** Checks not yet out whose next try is due. */
    retries: (now: number): Check[] => checks.filter((c) => c.messageId === null && c.posting === null && c.retryAt !== null && c.retryAt <= now),
    /** Whether a check this process runs is still trying to go out for this member: their record isn't the tick's to fail. */
    waits: (chat: ChatId, user: UserId): boolean => checks.some((c) => c.chat === chat && c.messageId === null && c.waiting.some((w) => w.user === user)),
    /** Keeps everyone waiting for a check not yet out restricted, and their records current, in 10-minute steps (newcomers-wait.ts). */
    stretch(now: number): void {
      for (const c of checks) if (c.messageId === null) for (const w of c.waiting) stepWaiting(records, deps.extend, c.chat, w.user, c.opened, now);
    },

    /** The group is no longer run: its checks, claims and taps are forgotten; the check messages it posted, for the caller to delete. */
    dropChat(chat: ChatId): number[] {
      const posted = new Set<number>();
      for (const c of checks.filter((check) => check.chat === chat)) {
        if (c.messageId !== null) posted.add(c.messageId);
        c.waiting = [];
        drop(c);
      }
      for (const [key, entry] of onCheck) if (key.startsWith(`${chat}:`)) posted.add(entry.messageId);
      for (const map of [onCheck, done, arriving]) for (const key of [...map.keys()]) if (key.startsWith(`${chat}:`)) map.delete(key);
      return [...posted];
    },

    /** Forgets what outlived its check: nothing is held past a check's deadline plus 5 minutes, or a check not out past its 30 minutes. */
    prune(now: number): void {
      for (const c of [...checks]) {
        if (c.posting !== null) continue;
        const end = c.postedAt !== null ? Math.max(c.postedAt, c.opened + BATCH_MS) + c.durationMs + GRACE_MS : c.opened + WAIT_MAX_MS + RETRY_MS + GRACE_MS;
        if (now > end) drop(c);
      }
      for (const map of [onCheck, done]) for (const [key, entry] of map) if (entry.until <= now) map.delete(key);
    },
  };
}

export type Board = ReturnType<typeof createBoard>;
