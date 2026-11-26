import type { AiLimits } from "../claude/types";
import { Limiter } from "../limiter";
import type { TgCallbackQuery } from "../types";
import type { CommunityOut } from "./out";

/**
 * Answering the admin and review buttons' presses (alert actions, the /mod
 * panel, review requests). Until a press is answered its presser sees a
 * spinner, so every press a handler takes gets one answer: a toast when
 * there is something to say, silence when it goes no further.
 */

/** Presses past someone's limit still answered, in all, per second: a flood of presses never becomes a flood of calls. */
const QUIET_PER_SECOND = 20;

/** One press's single answer. */
export interface PressReply {
  /** Answers with this toast, or silently without one; Telegram takes one answer per press, so later calls do nothing. */
  say(text?: string): Promise<void>;
  readonly answered: boolean;
}

export function pressReply(out: CommunityOut, q: TgCallbackQuery): PressReply {
  let answered = false;
  return {
    get answered() {
      return answered;
    },
    async say(text) {
      if (answered) return;
      answered = true;
      await out.answerPress(q.id, text);
    },
  };
}

/**
 * The per-person press limit (8 per 10 seconds), checked before any call to
 * Telegram. A press past it is answered silently, while such answers stay
 * under 20 a second for everyone together; past that it goes unanswered.
 */
export function pressLimit(limits: AiLimits): (q: TgCallbackQuery, reply: PressReply, now: number) => Promise<boolean> {
  const quiet = new Limiter(QUIET_PER_SECOND, 1_000);
  return async (q, reply, now) => {
    if (limits.press(q.from.id, now)) return true;
    if (quiet.allow(0, now)) await reply.say();
    return false;
  };
}
