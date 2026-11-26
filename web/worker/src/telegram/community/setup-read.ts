import type { FailureWatch, ReadFailure } from "./setup-status";
import type { ChatId, UserId } from "./types";

/**
 * A read that may be tried again when it fails: null means Telegram gave
 * nothing. `final`, when given, says the failure was Telegram's own answer
 * (setup-status.ts), which no retry changes: it isn't tried again.
 */
export type Read = <T>(load: () => Promise<T | null>, final?: () => boolean) => Promise<T | null>;

const WAITS: readonly number[] = [1_000, 2_000];
/** Past this much waiting in one round of checks, a failed read gets one try: Telegram is down, and the tick tries again. */
const WAIT_BUDGET_MS = 6_000;
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A reader whose failed reads are tried again after each wait, within one budget shared by every read of a round. */
export function retryingReader(waits: readonly number[] = WAITS, sleep: (ms: number) => Promise<void> = realSleep): Read {
  let spent = 0;
  return async <T>(load: () => Promise<T | null>, final?: () => boolean): Promise<T | null> => {
    for (let i = 0; ; i += 1) {
      const value = await load().catch(() => null);
      if (value !== null || final?.() === true) return value;
      const wait = waits[i];
      if (wait === undefined || spent + wait > WAIT_BUDGET_MS) return null;
      spent += wait;
      await sleep(wait);
    }
  };
}

/**
 * One setup read, tried again as `read` allows, through the failure watch
 * when there is one: its value, or what Telegram answered when it said no
 * for certain (then it isn't tried again). Without a watch every failure is
 * unsure.
 */
export async function readWatched<T>(
  watch: FailureWatch | undefined, read: Read, method: string, chat: ChatId, user: UserId | null, load: () => Promise<T | null>,
): Promise<{ value: T | null; failure: ReadFailure | null }> {
  const last: { failure: ReadFailure | null } = { failure: null };
  const value = await read(async () => {
    if (!watch) return load();
    const got = await watch.read(method, chat, user, load);
    last.failure = got.failure;
    return got.value;
  }, () => last.failure?.definite === true);
  return { value, failure: value === null ? last.failure : null };
}
