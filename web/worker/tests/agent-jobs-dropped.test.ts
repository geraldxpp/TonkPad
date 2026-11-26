import { describe, expect, it, vi } from "vitest";
import { JobQueue } from "../src/telegram/agent/jobs";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const S = 1_000;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A job that runs until finish(). */
function slowJob(): { run: () => Promise<void>; finish: () => void } {
  let finish = () => undefined as void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  return { run: () => done, finish: () => finish() };
}

describe("the job queue: a job dropped past its deadline", () => {
  it("calls the job's own onDropped once, instead of running it", async () => {
    let now = T0;
    const q = new JobQueue({ concurrency: 1, maxPending: 5, now: () => now });
    const slow = slowJob();
    const late = vi.fn(async () => undefined);
    const dropped = vi.fn();
    q.push("A", T0 + 60 * S, slow.run);
    expect(q.push("B", T0 + 60 * S, late, dropped)).toBe(true);
    now = T0 + 61 * S;
    // Pruned by the clock alone, before any slot frees.
    q.prune();
    expect(dropped).toHaveBeenCalledTimes(1);
    slow.finish();
    await settle();
    q.prune();
    expect(late).not.toHaveBeenCalled();
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(q.stats()).toEqual({ running: 0, waiting: 0, dropped: 1 });
  });

  it("calls it for a job already late when its turn comes, and survives a handler that throws", async () => {
    let now = T0;
    const q = new JobQueue({ concurrency: 1, maxPending: 5, now: () => now });
    const slow = slowJob();
    q.push("A", T0 + 120 * S, slow.run);
    q.push("B", T0 + 10 * S, async () => undefined, () => {
      throw new Error("the handler failed");
    });
    const next = vi.fn(async () => undefined);
    q.push("C", T0 + 120 * S, next);
    now = T0 + 20 * S;
    slow.finish();
    await settle();
    expect(next).toHaveBeenCalledTimes(1);
    expect(q.stats().dropped).toBe(1);
    // A job late at once is dropped as it is pushed, and told so.
    const told = vi.fn();
    expect(q.push("D", T0, async () => undefined, told)).toBe(true);
    await settle();
    expect(told).toHaveBeenCalledTimes(1);
  });

  it("never calls it for a job that ran, or one refused when the line is full", async () => {
    const q = new JobQueue({ concurrency: 1, maxPending: 0, now: () => T0 });
    const ran = vi.fn();
    const refused = vi.fn();
    expect(q.push("A", T0 + S, async () => undefined, ran)).toBe(true);
    expect(q.push("B", T0 + S, async () => undefined, refused)).toBe(false);
    await settle();
    expect(ran).not.toHaveBeenCalled();
    expect(refused).not.toHaveBeenCalled();
  });
});
