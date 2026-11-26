import type { Records } from "./types";

const TICK_MS = 5_000;
const PRUNE_MS = 60_000;

export interface DeleterInput {
  /** telegram-out, stopped or not: its tick sends the deletes the records say are due, and tries failed ones again. */
  out: { tick(now: number): Promise<void> };
  records: Pick<Records, "prune">;
  /** How many deletes the records still hold (due or not). */
  left: () => number;
  now: () => number;
  log: (line: string) => void;
}

/**
 * What keeps running once community mode is off, at start or later
 * (prompts/15-community-agent.md, State): the deletes the records still
 * hold, the bot's own notices and routine alerts and the members' messages
 * moderation removed, each sent as it falls due and tried again when it
 * fails, with the records' retention every minute, until no delete is left
 * (each leaves the records within 48 hours). Nothing else runs: no
 * moderation, alert or AI. Its timer never holds the process open.
 */
export function startDeleter(input: DeleterInput): { stop(): void } {
  let pruneAt = Number.NEGATIVE_INFINITY;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  async function tick(): Promise<void> {
    const at = input.now();
    if (at - pruneAt >= PRUNE_MS) {
      pruneAt = at;
      input.records.prune(at);
    }
    if (input.left() === 0) return stop();
    await input.out.tick(at);
  }

  timer = setInterval(() => {
    if (running) return;
    running = true;
    void tick()
      .catch(() => input.log("community deletes failed; tried again shortly"))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  timer.unref?.();
  return { stop };
}
