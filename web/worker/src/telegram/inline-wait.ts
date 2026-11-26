import type { BotContext } from "./context";
import { Limiter } from "./limiter";

/** Runs `run` after `ms` and returns what cancels it: timers in the worker, a test's own clock in the tests. */
export type Later = (run: () => void, ms: number) => () => void;

/** The worker's: an unref'd timer, so a wait never keeps the process alive. */
export const timers: Later = (run, ms) => {
  const timer = setTimeout(run, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
};

/** Telegram sends a query at each pause in typing: a person's text is answered once this long passes with no newer query from them. */
export const QUIET_MS = 350;
/** Past everyone's text budget, a person's newest text tries again this often… */
export const RETRY_MS = 100;
/** …while it is this fresh: Telegram takes an answer only for a short while, and the asker is waiting. */
export const ANSWER_MS = 5_000;

interface Waiting {
  cancel: () => void;
}

/**
 * Each person's newest inline text, waiting for a pause (inline.ts): a newer
 * query, or an address lookup, cancels the older one, which gets no answer
 * (Telegram shows only the newest query's results anyway), so a typing
 * burst costs one answer and one count against the limits. It holds a user
 * ID and their query only while it waits: under a second, a few seconds at
 * most past everyone's budget (ANSWER_MS).
 */
export class InlineTyping {
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly later: Later = timers) {}

  /** Runs `run` after `ms` unless the person types again first; their earlier wait is cancelled. */
  wait(person: number, ms: number, run: () => void): void {
    this.cancel(person);
    const entry: Waiting = { cancel: () => undefined };
    this.waiting.set(person, entry);
    entry.cancel = this.later(() => {
      if (this.waiting.get(person) !== entry) return;
      this.waiting.delete(person);
      run();
    }, ms);
  }

  /** Cancels the person's waiting text, if any. */
  cancel(person: number): void {
    this.waiting.get(person)?.cancel();
    this.waiting.delete(person);
  }

  /** How many people's text waits. */
  get size(): number {
    return this.waiting.size;
  }

  /** Cancels every wait: the bot stops. */
  stop(): void {
    for (const entry of this.waiting.values()) entry.cancel();
    this.waiting.clear();
  }
}

/**
 * Inline mode's limits (index.ts builds them; the tests use the same): a
 * person's address lookups, 5 in 10 s (pasting one sends 2 or 3 queries),
 * and their text where Ask isn't offered too; their text where it is, 30 in
 * 10 s; and for everyone, 10 lookups and 12 texts a second, each its own
 * budget, so people typing can't hold up a lookup, nor a few accounts use
 * either up. Text is answered only once its typist pauses (InlineTyping),
 * and only what is answered counts.
 */
export function inlineLimits(later?: Later): Pick<BotContext, "inlineLimiter" | "inlineText" | "inlineAll" | "inlineTextAll" | "inlineTyping"> {
  return {
    inlineLimiter: new Limiter(5, 10_000), inlineText: new Limiter(30, 10_000), inlineAll: new Limiter(10, 1_000), inlineTextAll: new Limiter(12, 1_000),
    inlineTyping: new InlineTyping(later),
  };
}
