import { afterEach, describe, expect, it, vi } from "vitest";
import { JobQueue, TYPING_EVERY_MS, TYPING_MAX_BEATS, withTyping } from "../src/telegram/agent/jobs";
import { callsOf, GROUP_ID, recordOut } from "./community-fixtures";

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);
const S = 1_000;
const NEVER = Number.POSITIVE_INFINITY;

/** Lets every pending promise callback run (real timers). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A job that notes when it starts and runs until finish(). */
function job(started: string[], name: string): { run: () => Promise<void>; finish: () => void } {
  let finish = () => undefined as void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    run: async () => {
      started.push(name);
      await done;
    },
    finish: () => finish(),
  };
}

describe("the job queue", () => {
  it("runs at most `concurrency` jobs at once, the next as soon as one ends", async () => {
    const started: string[] = [];
    const q = new JobQueue({ concurrency: 2, maxPending: 10 });
    const jobs = ["a", "b", "c"].map((name) => job(started, name));
    jobs.forEach((j, i) => expect(q.push(`chat-${i}`, NEVER, j.run)).toBe(true));
    expect(q.stats()).toEqual({ running: 2, waiting: 1, dropped: 0 });
    await settle();
    expect(started).toEqual(["a", "b"]);
    jobs[0].finish();
    await settle();
    expect(started).toEqual(["a", "b", "c"]);
    jobs[1].finish();
    jobs[2].finish();
    await settle();
    expect(q.stats()).toEqual({ running: 0, waiting: 0, dropped: 0 });
  });

  it("runs one job per key at a time, in order, while other keys go ahead", async () => {
    const started: string[] = [];
    const q = new JobQueue({ concurrency: 4, maxPending: 10 });
    const [a1, a2, a3, b1] = ["a1", "a2", "a3", "b1"].map((name) => job(started, name));
    q.push("A", NEVER, a1.run);
    q.push("A", NEVER, a2.run);
    q.push("A", NEVER, a3.run);
    q.push("B", NEVER, b1.run);
    expect(q.stats()).toEqual({ running: 2, waiting: 2, dropped: 0 });
    await settle();
    expect(started).toEqual(["a1", "b1"]);
    a1.finish();
    await settle();
    expect(started).toEqual(["a1", "b1", "a2"]);
    a2.finish();
    await settle();
    expect(started).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("runs up to `perKey` jobs of one key at once, in order, while other keys go ahead (model#4)", async () => {
    const started: string[] = [];
    const q = new JobQueue({ concurrency: 4, perKey: 2, maxPending: 10 });
    const [a1, a2, a3, a4, b1] = ["a1", "a2", "a3", "a4", "b1"].map((name) => job(started, name));
    for (const j of [a1, a2, a3, a4]) q.push("A", NEVER, j.run);
    q.push("B", NEVER, b1.run);
    expect(q.stats()).toEqual({ running: 3, waiting: 2, dropped: 0 });
    await settle();
    expect(started).toEqual(["a1", "a2", "b1"]);
    a2.finish();
    await settle();
    expect(started).toEqual(["a1", "a2", "b1", "a3"]);
    a1.finish();
    a3.finish();
    await settle();
    expect(started).toEqual(["a1", "a2", "b1", "a3", "a4"]);
    // One at a time per key unless given, as before.
    const single = new JobQueue({ concurrency: 4, maxPending: 10 });
    single.push("A", NEVER, job([], "x").run);
    single.push("A", NEVER, job([], "y").run);
    expect(single.stats()).toEqual({ running: 1, waiting: 1, dropped: 0 });
  });

  it("refuses a job when the line is full", () => {
    const q = new JobQueue({ concurrency: 1, maxPending: 2 });
    const started: string[] = [];
    expect(q.push("A", NEVER, job(started, "running").run)).toBe(true);
    expect(q.push("B", NEVER, job(started, "first in line").run)).toBe(true);
    expect(q.push("C", NEVER, job(started, "second in line").run)).toBe(true);
    expect(q.push("D", NEVER, job(started, "refused").run)).toBe(false);
    expect(q.stats()).toEqual({ running: 1, waiting: 2, dropped: 0 });
  });

  it("drops and counts a job whose deadline passed before it could start", async () => {
    let now = T0;
    const started: string[] = [];
    const q = new JobQueue({ concurrency: 1, maxPending: 5, now: () => now });
    const slow = job(started, "slow");
    const late = vi.fn(async () => undefined);
    q.push("A", T0 + 60 * S, slow.run);
    q.push("B", T0 + 45 * S, late);
    q.push("C", T0 + 120 * S, job(started, "on time").run);
    now = T0 + 50 * S;
    slow.finish();
    await settle();
    expect(late).not.toHaveBeenCalled();
    expect(started).toEqual(["slow", "on time"]);
    expect(q.stats()).toEqual({ running: 1, waiting: 0, dropped: 1 });
    // A job already late when it would start never runs either; Date.now is the clock by default.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const fresh = new JobQueue({ concurrency: 1, maxPending: 1 });
    const never = vi.fn(async () => undefined);
    expect(fresh.push("A", T0 - 1, never)).toBe(true);
    vi.useRealTimers();
    await settle();
    expect(never).not.toHaveBeenCalled();
    expect(fresh.stats()).toEqual({ running: 0, waiting: 0, dropped: 1 });
  });

  it("keeps going after a job throws or rejects", async () => {
    const errors: unknown[] = [];
    const q = new JobQueue({ concurrency: 1, maxPending: 5, onError: (e) => errors.push(e) });
    q.push("A", NEVER, async () => {
      throw new Error("model failed");
    });
    q.push("A", NEVER, () => {
      throw new Error("thrown at once");
    });
    const after = vi.fn(async () => undefined);
    q.push("A", NEVER, after);
    await settle();
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(2);
    expect(q.stats()).toEqual({ running: 0, waiting: 0, dropped: 0 });
    const careless = new JobQueue({ concurrency: 1, maxPending: 1, onError: () => {
      throw new Error("the handler failed too");
    } });
    careless.push("A", NEVER, async () => Promise.reject(new Error("no")));
    await settle();
    expect(careless.stats().running).toBe(0);
  });
});

describe("typing while an answer is written", () => {
  afterEach(() => vi.useRealTimers());

  it("is sent at once and every 4 seconds, in the topic, until the work is done", async () => {
    vi.useFakeTimers();
    const out = recordOut();
    let finish: (value: string) => void = () => undefined;
    const answer = withTyping(out, GROUP_ID, 7, () => new Promise<string>((resolve) => (finish = resolve)));
    expect(callsOf(out.log, "typing")).toEqual([[GROUP_ID, 7]]);
    await vi.advanceTimersByTimeAsync(TYPING_EVERY_MS - 1);
    expect(callsOf(out.log, "typing")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(callsOf(out.log, "typing")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2 * TYPING_EVERY_MS);
    expect(callsOf(out.log, "typing")).toHaveLength(4);
    finish("On fees: …");
    await expect(answer).resolves.toBe("On fees: …");
    await vi.advanceTimersByTimeAsync(60 * S);
    expect(callsOf(out.log, "typing")).toHaveLength(4);
  });

  it("stops after 12 beats however long the work runs", async () => {
    vi.useFakeTimers();
    const out = recordOut();
    let finish: () => void = () => undefined;
    const work = withTyping(out, GROUP_ID, undefined, () => new Promise<void>((resolve) => (finish = resolve)));
    await vi.advanceTimersByTimeAsync(120 * S);
    expect(callsOf(out.log, "typing")).toHaveLength(TYPING_MAX_BEATS);
    finish();
    await work;
    const short = recordOut();
    const quick = withTyping(short, GROUP_ID, undefined, () => new Promise<void>((resolve) => setTimeout(resolve, 10 * S)), { everyMs: 1_000, maxBeats: 3 });
    await vi.advanceTimersByTimeAsync(10 * S);
    await quick;
    expect(callsOf(short.log, "typing")).toHaveLength(3);
  });

  it("hands back the work's own error, and never lets typing's failures reach the work", async () => {
    vi.useFakeTimers();
    const failing = recordOut({ typing: async () => Promise.reject(new Error("telegram down")) });
    await expect(withTyping(failing, GROUP_ID, undefined, async () => "fine")).resolves.toBe("fine");
    const throwing = recordOut({ typing: () => {
      throw new Error("thrown at once");
    } });
    await expect(withTyping(throwing, GROUP_ID, 3, async () => 1)).resolves.toBe(1);
    const out = recordOut();
    await expect(withTyping(out, GROUP_ID, undefined, async () => Promise.reject(new Error("model failed")))).rejects.toThrow("model failed");
    await vi.advanceTimersByTimeAsync(30 * S);
    expect(callsOf(out.log, "typing")).toHaveLength(1);
  });
});
