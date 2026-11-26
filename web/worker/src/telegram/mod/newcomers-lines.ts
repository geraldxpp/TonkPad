import type { CommunityOut } from "../community/out";
import { MUTED } from "../community/permissions";
import type { ChatId, UserId } from "../community/types";

/**
 * Each newcomer's Telegram calls, in order: the check's restriction first,
 * then whatever follows it (text only once they pass, their removal, a
 * mute, a restriction of their own put back), so a later call never
 * overtakes an earlier one and leaves the wrong restriction in place.
 * Different newcomers never wait on each other, and nothing waits on a
 * check message's edits. A task starts at once when its newcomer has
 * nothing under way. A line holds the chat and user IDs only while its
 * calls run; it never rejects.
 */
export type Lines = (chat: ChatId, user: UserId, task: () => Promise<void>) => Promise<void>;

export function createLines(log?: (line: string) => void): Lines {
  const lines = new Map<string, Promise<void>>();
  const start = (task: () => Promise<void>): Promise<void> => {
    try {
      return task();
    } catch (error: unknown) {
      return Promise.reject(error);
    }
  };
  return (chat, user, task) => {
    const key = `${chat}:${user}`;
    const before = lines.get(key);
    const run = (before ? before.then(task) : start(task)).catch(() => log?.("a new-member check step failed"));
    lines.set(key, run);
    void run.then(() => {
      if (lines.get(key) === run) lines.delete(key);
    });
    return run;
  };
}

/** The check's restriction (nothing at all) until `until` (ms), in the newcomer's line: as they join, and again while their check is late. */
export function muter(lines: Lines, out: Pick<CommunityOut, "restrict">, log?: (line: string) => void) {
  return (chat: ChatId, user: UserId, until: number): Promise<void> =>
    lines(chat, user, async () => {
      if (!(await out.restrict(chat, user, MUTED, Math.floor(until / 1_000)))) log?.("a newcomer wasn't restricted for the check");
    });
}

/** Resolves after `ms`, on a timer that doesn't hold the process open. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** What `p` gives, or `fallback` when it fails or `ms` pass first. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
    const settle = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    p.then(settle, () => settle(fallback));
  });
}
