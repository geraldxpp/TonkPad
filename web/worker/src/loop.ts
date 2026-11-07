import { log } from "./config";

/** Runs `task` every `ms`, never overlapping itself. */
export function every(ms: number, task: () => Promise<void>): void {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  }, ms);
}

/** A failure logger that reports each source at most once a minute, so a flaky feed can't flood the logs. */
export function throttledFailures(): (scope: string, error: unknown) => void {
  const lastFailure = new Map<string, number>();
  return (scope, error) => {
    const now = Date.now();
    if (now - (lastFailure.get(scope) ?? 0) < 60_000) return;
    lastFailure.set(scope, now);
    log(scope, error instanceof Error ? error.message : "request failed");
  };
}
