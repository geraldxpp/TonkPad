import type { AdminAlert } from "./types";

/** A paced alert the admin chat's queue dropped is tried again this much later… */
const RETRY_MS = 5_000;
/** …and at most this many times in all. */
const TRIES = 3;

export interface PaceDeps {
  /** Sends one alert with its buttons; true once it went out. */
  send(a: AdminAlert): Promise<boolean>;
  /** An alert that couldn't go out in its time: it joins a summary at once, so nothing outlives the memory line. */
  late(a: AdminAlert): void;
  /** The moment past which an alert raised at `raised` may wait no longer. */
  deadline(raised: number): number;
  now: () => number;
}

export interface Pace {
  /** Queues an alert behind those already waiting. */
  push(a: AdminAlert, raised: number): void;
  /** Alerts waiting their turn, the one being sent included. */
  waiting(): number;
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

/**
 * The alerts that keep their own message in a storm (community/alerts.ts:
 * an Undo, Unmute or Unban, and the raid alert): sent one at a time, in
 * order, each once the one before it has gone, so the admin chat's queue
 * (20 deep, 20 seconds) never drops one for waiting behind the others. A
 * send the queue still dropped is tried again 5 seconds later, 3 times at
 * most; one that can't go out before its deadline (9 minutes 30 seconds
 * after it was raised) joins a summary instead, without its buttons, so its
 * name and excerpt never outlive the privacy page's 10 minutes. Nothing
 * here throws.
 */
export function createPace(deps: PaceDeps): Pace {
  const queue: Array<{ a: AdminAlert; raised: number; tries: number }> = [];
  let running = false;

  async function run(): Promise<void> {
    running = true;
    try {
      while (queue.length > 0) {
        const head = queue[0];
        if (head.tries >= TRIES || deps.now() >= deps.deadline(head.raised)) {
          queue.shift();
          deps.late(head.a);
          continue;
        }
        head.tries += 1;
        const sent = await deps.send(head.a).catch(() => false);
        if (sent) queue.shift();
        else await pause(RETRY_MS);
      }
    } catch {
      // A summary that couldn't be written: what is left waits for the next push.
    } finally {
      running = false;
    }
  }

  return {
    push(a, raised) {
      queue.push({ a, raised, tries: 0 });
      if (!running) void run();
    },
    waiting: () => queue.length,
  };
}
