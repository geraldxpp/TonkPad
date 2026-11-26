import type { ChatId, UserId } from "../community/types";
import type { TgCallbackQuery } from "../types";
import type { NewcomersDeps } from "./newcomers";
import type { Board } from "./newcomers-board";
import type { Steps } from "./newcomers-steps";
import { langOf, validUser } from "./newcomers-view";

/**
 * Taps on the check (h:…), answered at once. The per-person press limit (8
 * in 10 seconds) is checked before anything else: past it there is no
 * answer at all, not even an API call, and the app's spinner stops by
 * itself. Someone not on this check gets a toast, a few a second per group
 * at most (the rest are dropped without a word), so a press flood can't
 * fill Telegram's 25 a second; someone just let in or removed gets no word.
 * A wrong tap is counted as it comes, so quick taps can't win a third try.
 * Letting in and removing happen in the newcomer's line; nothing here waits
 * for Telegram. The toast window holds group IDs and times, for a second.
 */

const MAX_TRIES = 2;
const NOT_YOU_PER_SECOND = 3;
const SECOND = 1_000;

export type QueueFail = (chat: ChatId, user: UserId, messageId: number) => void;

export function createPresses(deps: NewcomersDeps, board: Board, steps: Steps, queueFail: QueueFail) {
  const { out, records } = deps;
  const toasts = new Map<ChatId, number[]>();

  /** Whether this group may show another "for someone else" toast now. */
  function toastRoom(chat: ChatId, now: number): boolean {
    const recent = (toasts.get(chat) ?? []).filter((at) => now - at < SECOND);
    const room = recent.length < NOT_YOU_PER_SECOND;
    if (room) recent.push(now);
    toasts.set(chat, recent);
    return room;
  }

  async function onPress(q: TgCallbackQuery, now: number): Promise<boolean> {
    const data = q.data ?? "";
    if (!data.startsWith("h:")) return false;
    if (!validUser(q.from) || !deps.press(q.from.id, now)) return true;
    const answer = (text?: string) => void out.answerPress(q.id, text).catch(() => false);
    const chat = q.message?.chat.id;
    const messageId = q.message?.message_id;
    const tapped = /^h:(\d)$/.exec(data);
    if (chat === undefined || messageId === undefined || !tapped) {
      answer();
      return true;
    }
    const d = deps.words(langOf(q.from, deps.groupLang));
    const p = records.pending(chat, q.from.id);
    if (!p || p.messageId !== messageId) {
      if (board.wasDone(chat, q.from.id, messageId, now)) answer();
      else if (toastRoom(chat, now)) answer(d.check.notYou);
    } else if (p.tries >= MAX_TRIES) {
      // Out of tries and on the way out (queued once, even when the records came back after a restart).
      answer();
      queueFail(chat, p.user, p.messageId);
    } else if (Number(tapped[1]) === (p.target ?? 0)) {
      const risk = steps.nameRisk(chat, q.from);
      // Only someone who can now chat is told so.
      answer(risk === null ? d.check.passed : undefined);
      steps.pass(chat, p, q.from, risk, now);
    } else if (p.tries + 1 < MAX_TRIES) {
      records.setPending({ ...p, tries: p.tries + 1 });
      answer(d.check.wrong);
    } else {
      records.setPending({ ...p, tries: MAX_TRIES });
      answer();
      queueFail(chat, p.user, p.messageId);
    }
    return true;
  }

  return {
    onPress,
    prune(now: number): void {
      for (const [chat, list] of toasts) if (list.every((at) => now - at >= SECOND)) toasts.delete(chat);
    },
  };
}
