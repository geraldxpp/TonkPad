import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUTED, TEXT_ONLY } from "../src/telegram/community/permissions";
import { callsOf, GROUP_ID, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";
import { MINUTE, person, press, SECOND, setup } from "./mod-newcomers-setup";

/** Resolves `value` after `ms` on the fake clock: a Telegram call that takes that long. */
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
/** Whether a promise has settled, without waiting for it. */
function settled(p: Promise<unknown>): () => boolean {
  let done = false;
  void p.then(() => (done = true), () => (done = true));
  return () => done;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("presses on the new-member check", () => {
  it("answers someone not on the check with a toast, a few a second per group, past 8 presses in 10 seconds not at all, and never makes a joiner wait", async () => {
    // Each answer takes a second to come back, as in a busy minute.
    const { out, newcomers, join } = setup({ out: { answerPress: () => after(SECOND, true) } });
    await join([person(201)], 71, NOW);
    const presses = Array.from({ length: 30 }, () => settled(newcomers.onPress(press(person(999), "h:0", 5001), NOW + SECOND)));
    const joining = settled(join([person(202)], 72, NOW + SECOND));
    await vi.advanceTimersByTimeAsync(100);

    expect(presses.every((done) => done())).toBe(true);
    expect(joining()).toBe(true);
    expect(callsOf(out.log, "restrict").map((c) => c[1])).toEqual([201, 202]);
    // 8 within the limit, of which the group's toasts take 3 a second; the rest get no answer and cost no API call.
    expect(callsOf(out.log, "answerPress").map((c) => c[1])).toEqual([testWords.check.notYou, testWords.check.notYou, testWords.check.notYou]);
  });

  it("caps the toasts per group, whoever presses, and lets more through a second later", async () => {
    const { out, newcomers, join } = setup();
    await join([person(201)], 71, NOW);
    // Ten people, none on the check, each well within their own limit.
    for (let i = 0; i < 10; i += 1) await newcomers.onPress(press(person(900 + i), "h:0", 5001), NOW + SECOND);
    expect(callsOf(out.log, "answerPress")).toHaveLength(3);
    // The newcomer's own tap is never held back by the cap.
    await newcomers.onPress(press(person(201), "h:0", 5001), NOW + SECOND);
    expect(callsOf(out.log, "answerPress").at(-1)).toEqual(["q201:h:0", testWords.check.passed]);
    for (let i = 0; i < 4; i += 1) await newcomers.onPress(press(person(910 + i), "h:0", 5001), NOW + 2 * SECOND);
    expect(callsOf(out.log, "answerPress").filter((c) => c[1] === testWords.check.notYou)).toHaveLength(6);
  });

  it("answers a newcomer's tap at once and returns, though other check work is still waiting on Telegram", async () => {
    let slow = false;
    const { out, records, newcomers, join } = setup({ out: { restrict: () => (slow ? after(10 * SECOND, true) : Promise.resolve(true)) } });
    await join([person(201)], 71, NOW);
    slow = true;
    void join([person(202)], 72, NOW + SECOND);
    const tap = settled(newcomers.onPress(press(person(201), "h:0", 5001), NOW + 2 * SECOND));
    await vi.advanceTimersByTimeAsync(100);

    expect(tap()).toBe(true);
    expect(callsOf(out.log, "answerPress")).toEqual([["q201:h:0", testWords.check.passed]]);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + 2 * SECOND)).toBe(true);
    expect(records.pending(GROUP_ID, 201)).toBeNull();
    expect(callsOf(out.log, "restrict").find((c) => c[1] === 201 && c[2] === TEXT_ONLY)).toBeDefined();
  });

  it("lets a tap's text-only days follow the newcomer's own restriction, never overtake it", async () => {
    const { out, newcomers, join } = setup({ out: { restrict: (_chat, _user, permissions) => (permissions === MUTED ? after(5 * SECOND, true) : Promise.resolve(true)) } });
    void join([person(201)], 71, NOW);
    await vi.advanceTimersByTimeAsync(0);
    const tap = settled(newcomers.onPress(press(person(201), "h:0", 5001), NOW + SECOND));
    await vi.advanceTimersByTimeAsync(100);
    expect(tap()).toBe(true);
    expect(callsOf(out.log, "answerPress")).toEqual([["q201:h:0", testWords.check.passed]]);
    expect(callsOf(out.log, "restrict").map((c) => c[2])).toEqual([MUTED]);
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    expect(callsOf(out.log, "restrict").map((c) => c[2])).toEqual([MUTED, TEXT_ONLY]);
  });

  it("counts each wrong tap as it comes, so quick taps can't win a third try", async () => {
    const { out, records, newcomers, join } = setup({ strictness: "strict" });
    await join([person(201)], 71, NOW);
    const target = records.pending(GROUP_ID, 201)?.target ?? 0;
    const wrong = `h:${(target % 9) + 1}`;
    await Promise.all([
      newcomers.onPress(press(person(201), wrong, 5001), NOW + SECOND),
      newcomers.onPress(press(person(201), wrong, 5001), NOW + SECOND),
      newcomers.onPress(press(person(201), `h:${target}`, 5001), NOW + SECOND),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsOf(out.log, "answerPress").map((c) => c[1])).toEqual([testWords.check.wrong, undefined, undefined]);
    expect(callsOf(out.log, "kick")).toEqual([[GROUP_ID, 201]]);
    expect(callsOf(out.log, "restrict").map((c) => c[2])).toEqual([MUTED]);
    expect(records.isNewcomer(GROUP_ID, 201, NOW + MINUTE)).toBe(false);
  });

  it("checks the press limit before anything else, a newcomer's own taps included, and past it answers nothing at all", async () => {
    const { out, records, newcomers, join } = setup({ press: () => false });
    await join([person(201)], 71, NOW);
    expect(await newcomers.onPress(press(person(201), "h:0", 5001), NOW + SECOND)).toBe(true);
    expect(await newcomers.onPress(press(person(999), "h:0", 5001), NOW + SECOND)).toBe(true);
    // No answer, so no API call: the app's spinner stops by itself.
    expect(callsOf(out.log, "answerPress")).toEqual([]);
    expect(records.pending(GROUP_ID, 201)).not.toBeNull();
    expect(callsOf(out.log, "restrict").map((c) => c[2])).toEqual([MUTED]);
  });
});
