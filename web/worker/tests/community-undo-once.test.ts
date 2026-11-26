import { afterEach, describe, expect, it, vi } from "vitest";
import { GROUP_ID, testWords } from "./community-fixtures";
import { alertMarkup, MEMBER_ID, press, setup, TITLE_ONLY, x } from "./community-undo-fixtures";
import { HOUR, MIN, NOW, SEC } from "./fixtures";

/** A warning's buttons: Undo, Ban, Trust, Handled. */
const WARN_ALERT = alertMarkup(x("u"), x("b"), x("t"), x("h", 0));

describe("actions on an alert about an administrator (admin-privacy-docs#6)", () => {
  it("answers Trust, Ban, Unmute and Mute 1 h with the admin toast, and calls nothing on Telegram", async () => {
    for (const action of ["t", "b", "m", "q"]) {
      const s = setup();
      const data = x(action, TITLE_ONLY.id);
      expect(await s.undo.onPress(press(data, { markup: alertMarkup(data, x("h", 0)) }))).toBe(true);
      expect(s.calls(), action).toEqual([["answerPress", "press-1", testWords.admin.isAdmin]]);
      expect(s.records.isTrusted(GROUP_ID, TITLE_ONLY.id)).toBe(false);
    }
  });

  it("still lets an admin mark Handled on such an alert", async () => {
    const s = setup();
    await s.undo.onPress(press(x("h", 0), { markup: alertMarkup(x("t", TITLE_ONLY.id), x("h", 0)) }));
    expect(s.calls().map((c) => c[0])).toEqual(["answerPress", "edit"]);
  });
});

describe("a used button stays used (admin-privacy-docs#7)", () => {
  afterEach(() => void vi.useRealTimers());

  it("refuses a second Undo after 11 minutes when the alert's edit was dropped, taking back no second warning", async () => {
    const s = setup({ out: { edit: async () => false } });
    for (let i = 0; i < 3; i += 1) s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "invite_link", true);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT }));
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(2);
    s.later(11 * MIN);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT, id: "press-2" }));
    s.later(46 * HOUR);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT, id: "press-3" }));
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(2);
    expect(s.calls().filter((c) => c[0] === "answerPress").slice(1)).toEqual([
      ["answerPress", "press-2", undefined],
      ["answerPress", "press-3", undefined],
    ]);
  });

  it("tries a dropped edit once more, 30 seconds later", async () => {
    vi.useFakeTimers();
    const edit = vi.fn(async () => false);
    const s = setup({ out: { edit } });
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT }));
    await vi.advanceTimersByTimeAsync(0);
    expect(edit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29 * SEC);
    expect(edit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SEC);
    expect(edit).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it("edits once when the edit lands", async () => {
    vi.useFakeTimers();
    const edit = vi.fn(async () => true);
    const s = setup({ out: { edit } });
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT, id: "press-9" }));
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(s.calls()[0]).toEqual(["answerPress", "press-9", testWords.admin.done]);
  });
});
