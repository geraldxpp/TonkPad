import type { BoardDeps, Check, Waiting } from "./newcomers-board";
import type { Refresh } from "./newcomers-edits";
import { checkHtml, checkKeyboard } from "./newcomers-view";
import { RETRY_MS, WAIT_MAX_MS } from "./newcomers-wait";

/**
 * Posting a check message for everyone waiting on it, who are pending from
 * when it went out. One that doesn't go out (the group's minute full, its
 * queue full, Telegram refusing it) is tried again 15 seconds later, while
 * they stay restricted (newcomers-wait.ts); after 30 minutes it hands them
 * back, for text only (newcomers-steps.ts).
 */

export type Posted = { kind: "sent" } | { kind: "retry" } | { kind: "failed"; members: Waiting[] };

export interface PostParts {
  /** Puts a member on the posted check; false when their record went meanwhile. */
  pend(check: Check, w: Waiting, messageId: number, now: number): boolean;
  refresh: Refresh;
  /** Forgets a check that is done with. */
  drop(check: Check): void;
  /** Who still waits for it: on it, with their record still waiting. */
  waitingOn(check: Check): Waiting[];
}

export async function postCheck(deps: BoardDeps, parts: PostParts, check: Check): Promise<Posted> {
  check.waiting = parts.waitingOn(check);
  if (check.waiting.length === 0) {
    parts.drop(check);
    return { kind: "sent" };
  }
  // Past its 30 minutes a check never goes out late: a retry that lands after them hands everyone back, as a failure does.
  if (deps.now() >= check.opened + WAIT_MAX_MS) {
    parts.drop(check);
    const members = parts.waitingOn(check);
    check.waiting = [];
    return { kind: "failed", members };
  }
  const d = deps.words(deps.groupLang);
  const named = check.waiting.map((w) => w.user);
  const html = checkHtml(named.map((id) => ({ id })), d, deps.groupLang, check.durationMs, check.target);
  const id = await deps.out.send(check.chat, html, { kind: "check", replyTo: check.replyTo ?? undefined, keyboard: checkKeyboard(d, check.target) });
  const at = deps.now();
  if (id !== null) {
    check.messageId = id;
    check.postedAt = at;
    check.retryAt = null;
    const all = parts.waitingOn(check);
    check.waiting = [];
    for (const w of all) parts.pend(check, w, id, at);
    // Whoever joined or left while it was on its way: the message names everyone pending now (or goes).
    if (all.length !== named.length || all.some((w, i) => w.user !== named[i])) parts.refresh(check.chat, id);
    return { kind: "sent" };
  }
  if (at < check.opened + WAIT_MAX_MS) {
    check.retryAt = at + RETRY_MS;
    return { kind: "retry" };
  }
  parts.drop(check);
  const members = parts.waitingOn(check);
  check.waiting = [];
  return { kind: "failed", members };
}
