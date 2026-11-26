import type { ChatId } from "../community/types";

/** A bot can delete its own message for 48 hours: past that, the pair is of no use. */
export const ANSWERED_MS = 48 * 60 * 60 * 1_000;
export const ANSWERED_MAX = 5_000;

/**
 * Which of the bot's answers replies to which question, so an edited
 * question takes its answer down (an edit could turn the question around).
 * Message IDs only, in memory: no user IDs and no text. Each pair is kept
 * 48 hours, and at most 5,000 of them: past that, the oldest goes first.
 */
export class AnsweredMap {
  private readonly pairs = new Map<string, { answer: number; at: number }>();

  note(chat: ChatId, questionId: number, answerId: number, now: number): void {
    const key = `${chat}:${questionId}`;
    this.pairs.delete(key);
    this.pairs.set(key, { answer: answerId, at: now });
    for (const oldest of this.pairs.keys()) {
      if (this.pairs.size <= ANSWERED_MAX) break;
      this.pairs.delete(oldest);
    }
  }

  /** The answer to this question, or null when there is none or it is 48 hours old. */
  answerOf(chat: ChatId, questionId: number, now: number): number | null {
    const key = `${chat}:${questionId}`;
    const pair = this.pairs.get(key);
    if (!pair) return null;
    if (now - pair.at < ANSWERED_MS) return pair.answer;
    this.pairs.delete(key);
    return null;
  }

  forget(chat: ChatId, questionId: number): void {
    this.pairs.delete(`${chat}:${questionId}`);
  }

  prune(now: number): void {
    for (const [key, pair] of this.pairs) if (now - pair.at >= ANSWERED_MS) this.pairs.delete(key);
  }
}
