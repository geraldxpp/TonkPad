/**
 * One clock for everything that moves with the 6 s radar sweep: the sweep
 * itself, the blip pings, the status-bar fill and both "Next sweep" countdowns.
 *
 * CSS animations run on the document timeline. The first synced animation to
 * start sets the origin; every later one is pinned to the same start time, so
 * they stay phase-locked even when they mount at different moments.
 */
export const SWEEP_MS = 6000;

export const SYNCED_ANIMATIONS: ReadonlySet<string> = new Set(["tk-sweep", "tk-ping", "tk-blip", "tk-fill"]);

let origin: number | null = null;

export function sweepOrigin(): number {
  return origin ?? 0;
}

/** Test helper. */
export function resetSweepOrigin(): void {
  origin = null;
}

export function lockToSweep(animations: readonly Animation[]): void {
  for (const animation of animations) {
    if (origin === null && typeof animation.startTime === "number") origin = animation.startTime;
  }
  if (origin === null) return;
  for (const animation of animations) animation.startTime = origin;
}

/** Whole seconds until the sweep returns to its start: 6, 5, … 1, then 6 again. */
export function secondsToNextSweep(now: number, from: number = sweepOrigin()): number {
  const elapsed = (((now - from) % SWEEP_MS) + SWEEP_MS) % SWEEP_MS;
  return SWEEP_MS / 1000 - Math.floor(elapsed / 1000);
}

export function formatCountdown(seconds: number): string {
  return `0:${String(seconds).padStart(2, "0")}`;
}

/** What the countdown shows when motion is reduced (matches the design). */
export const STATIC_COUNTDOWN = "0:04";
