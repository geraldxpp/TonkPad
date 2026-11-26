import { DIGEST_MS } from "./alerts-batch";
import type { AdminAlert, AlertSink } from "./types";

/**
 * An alert waits here at most 9 minutes 30 seconds: it carries names and
 * excerpts, which the privacy page keeps in memory for 10 minutes at most,
 * counted from when it was raised, its send's wait included.
 */
const HOLD_MS = DIGEST_MS;
const HOLD_MAX = 100;

export type GateState = "open" | "wait" | "shut";

/**
 * What the gate passes alerts on to (community/alerts.ts), with when each
 * was raised, so the time it waited here counts toward its own: its tick
 * sends what is due; its prune, when it has one, forgets what it keeps.
 */
export interface GatedSink {
  alert(a: AdminAlert, raised?: number): void;
  tick(now: number): Promise<void>;
  prune?(now: number): void;
}

export interface AlertGate extends AlertSink {
  tick(now: number): Promise<void>;
  state(): GateState;
  /** The admin chat passed its checks: what waited goes out, then everything as it comes. */
  open(): void;
  /** Community mode is off: what waited is dropped, and so is everything after. */
  shut(): void;
  /** Forgets alerts that waited 9 minutes 30 seconds, then lets the sink forget what it keeps (alerts.ts: its repeat keys), whatever the gate's state. */
  prune(now: number): void;
}

/**
 * The admin chat's alerts while its setup checks wait on Telegram
 * (setup-retry.ts): held in memory, at most 100 and at most 9 minutes 30
 * seconds each, then passed on once the chat passes, each with the time it
 * was raised (the sink counts its batches' times from then), or dropped if
 * it fails. Open, it passes every alert and tick straight on. Its prune
 * reaches the sink too, since the hooks' tick prunes the gate alone
 * (index-hooks-tick.ts).
 */
export function createAlertGate(sink: GatedSink, now: () => number, initial: GateState): AlertGate {
  let state = initial;
  let held: Array<{ alert: AdminAlert; at: number }> = [];
  const forgetHeld = (at: number) => {
    held = held.filter((h) => at - h.at < HOLD_MS);
  };
  return {
    alert(a) {
      if (state === "open") return sink.alert(a);
      if (state === "shut") return;
      const at = now();
      forgetHeld(at);
      held.push({ alert: a, at });
      if (held.length > HOLD_MAX) held = held.slice(-HOLD_MAX);
    },
    tick: (at) => (state === "open" ? sink.tick(at) : Promise.resolve()),
    state: () => state,
    open() {
      if (state !== "wait") return;
      state = "open";
      forgetHeld(now());
      const waiting = held;
      held = [];
      for (const h of waiting) sink.alert(h.alert, h.at);
    },
    shut() {
      state = "shut";
      held = [];
    },
    prune(at) {
      forgetHeld(at);
      sink.prune?.(at);
    },
  };
}
