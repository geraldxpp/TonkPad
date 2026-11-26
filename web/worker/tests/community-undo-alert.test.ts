import { describe, expect, it } from "vitest";
import { LIFTED } from "../src/telegram/community/permissions";
import { ladderStep } from "../src/telegram/mod/ladder";
import type { InlineKeyboard } from "../src/telegram/types";
import { ADMIN_CHAT_ID, GROUP_ID, testWords } from "./community-fixtures";
import { ALERT_ID, alertMarkup, LINK, MEMBER_ID, press, setup, TEXT_HTML, x } from "./community-undo-fixtures";
import { MIN, NOW } from "./fixtures";

/** Lets presses that run side by side reach their awaits. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** A mute alert's buttons: Unmute, Ban, Trust, Handled. */
const MUTE_ALERT = alertMarkup(x("m"), x("b"), x("t"), x("h", 0));
/** A warning's: Undo, Ban, Trust, Handled. */
const WARN_ALERT = alertMarkup(x("u"), x("b"), x("t"), x("h", 0));
/** A removal with no sanction (a slur deleted, nothing recorded): Ban, Trust, Handled. */
const PLAIN_ALERT = alertMarkup(x("b"), x("t"), x("h", 0));

describe("Unmute and Trust take back the offence their alert recorded", () => {
  it("lifts a wrongful mute and its rule-certain offence, so the ladder can't end in a ban because of it", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "phishing", true);
    await s.undo.onPress(press(x("m"), { markup: MUTE_ALERT }));
    expect(s.calls()[0]).toEqual(["restrict", GROUP_ID, MEMBER_ID, LIFTED, 0]);
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW)).toMatchObject({ n: 0, certain: 0 });
    // Three ordinary offences later, normal mode stops at a 24-hour mute: no certain offence is left to end in a ban.
    for (let i = 0; i < 3; i += 1) s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
    expect(ladderStep("normal", s.records.offences(GROUP_ID, MEMBER_ID, NOW)).kind).toBe("mute");
  });

  it("trusts and takes back the offence while the alert still offers its Unmute or Undo", async () => {
    for (const markup of [MUTE_ALERT, WARN_ALERT]) {
      const s = setup();
      s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "lookalike", true);
      await s.undo.onPress(press(x("t"), { markup }));
      expect(s.records.isTrusted(GROUP_ID, MEMBER_ID)).toBe(true);
      expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(0);
    }
  });

  it("leaves the record alone when the alert offered nothing to undo", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
    await s.undo.onPress(press(x("t"), { markup: PLAIN_ALERT }));
    expect(s.records.isTrusted(GROUP_ID, MEMBER_ID)).toBe(true);
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(1);
  });

  it("takes an alert's offence back once, whichever of Unmute and Trust comes first", async () => {
    const s = setup();
    for (let i = 0; i < 3; i += 1) s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
    await s.undo.onPress(press(x("m"), { markup: MUTE_ALERT }));
    // Trust pressed before the alert's edit lands: its keyboard still shows Unmute.
    await s.undo.onPress(press(x("t"), { markup: MUTE_ALERT, id: "press-2" }));
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(2);
  });

  it("keeps the offence when the unmute didn't take, so trying again removes only one", async () => {
    const s = setup({ out: { restrict: async () => false } });
    s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
    await s.undo.onPress(press(x("m"), { markup: MUTE_ALERT }));
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(1);
    expect(s.calls().at(-1)).toEqual(["answerPress", "press-1", testWords.check.retry]);
  });
});

describe("each undo button acts once", () => {
  it("removes one warning when Undo is pressed twice at once", async () => {
    const s = setup();
    for (let i = 0; i < 3; i += 1) s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "invite_link", true);
    await Promise.all([s.undo.onPress(press(x("u"), { markup: WARN_ALERT })), s.undo.onPress(press(x("u"), { markup: WARN_ALERT, id: "press-2" }))]);
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(2);
    const answers = s.calls().filter((c) => c[0] === "answerPress");
    expect(answers).toHaveLength(2);
    expect(answers).toContainEqual(["answerPress", "press-1", testWords.admin.done]);
    expect(answers).toContainEqual(["answerPress", "press-2", undefined]);
  });

  it("ignores a repeat press on the same alert for 10 minutes, answered silently", async () => {
    const s = setup();
    for (let i = 0; i < 3; i += 1) s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "invite_link", true);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT }));
    s.later(9 * MIN);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT, id: "press-2" }));
    expect(s.records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(2);
    expect(s.calls().at(-1)).toEqual(["answerPress", "press-2", undefined]);
  });

  it("edits the alert without the button that was used, keeping its text and the other buttons", async () => {
    const cases: Array<[string, InlineKeyboard, string[]]> = [
      [x("u"), WARN_ALERT, [x("b"), x("t"), x("h", 0)]],
      [x("m"), MUTE_ALERT, [x("b"), x("t"), x("h", 0)]],
      [x("b0"), alertMarkup(x("b0"), x("t"), x("h", 0)), [x("t"), x("h", 0)]],
      // Trust also lifts the mute and takes the offence back: Unmute goes with it.
      [x("t"), MUTE_ALERT, [x("b"), x("h", 0)]],
    ];
    for (const [data, markup, left] of cases) {
      const s = setup();
      s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
      await s.undo.onPress(press(data, { markup }));
      const edit = s.calls().find((c) => c[0] === "edit");
      expect(edit?.slice(1, 4)).toEqual([ADMIN_CHAT_ID, ALERT_ID, TEXT_HTML]);
      const keyboard = edit?.[4] as InlineKeyboard;
      expect(keyboard.inline_keyboard[0]).toEqual([{ text: "Open message", url: LINK }]);
      expect(keyboard.inline_keyboard.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : []))).toEqual(left);
    }
  });

  it("answers before it edits the alert", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER_ID, NOW, "flood", false);
    await s.undo.onPress(press(x("u"), { markup: WARN_ALERT }));
    expect(s.calls().map((c) => c[0])).toEqual(["answerPress", "edit"]);
  });
});

describe("Handled", () => {
  it("answers the press before its edit waits in the admin chat's queue", async () => {
    let release: (ok: boolean) => void = () => undefined;
    const s = setup({ out: { edit: () => new Promise<boolean>((resolve) => (release = resolve)) } });
    const pending = s.undo.onPress(press(x("h", 0)));
    await settle();
    expect(s.calls().map((c) => c[0])).toEqual(["answerPress", "edit"]);
    expect(s.calls()[0]).toEqual(["answerPress", "press-1", testWords.admin.done]);
    release(true);
    expect(await pending).toBe(true);
  });
});

describe("presses the alerts take and go no further with", () => {
  it("are answered silently, so the spinner stops", async () => {
    const quiet = [
      { q: press(x("m")), limited: true },
      { q: press(x("b"), { chat: { id: GROUP_ID, type: "supergroup" } }) },
      { q: press(x("b", MEMBER_ID, -1005555555555)) },
      { q: press(x("b"), { markup: { inline_keyboard: [] } }) },
      { q: press("x:zz:1:2") },
    ];
    for (const { q, limited } of quiet) {
      const s = setup({ press: !limited });
      expect(await s.undo.onPress(q)).toBe(true);
      expect(s.calls()).toEqual([["answerPress", "press-1", undefined]]);
    }
  });
});
