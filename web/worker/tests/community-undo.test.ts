import { describe, expect, it } from "vitest";
import { LIFTED, MUTED } from "../src/telegram/community/permissions";
import { parsePress } from "../src/telegram/community/undo";
import { messageHtml } from "../src/telegram/community/undo-html";
import { nameHash } from "../src/telegram/mod/names";
import type { TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, GROUP, GROUP_ID, testWords } from "./community-fixtures";
import { ADMIN, ALERT_ID, ANONYMOUS, DELETE_ONLY, MEMBER_ID, press, setup, STRANGER, TEXT_HTML, TITLE_ONLY, x } from "./community-undo-fixtures";
import { NOW } from "./fixtures";

describe("createUndo: which presses count", () => {
  it("leaves presses that aren't the admin chat's to others", async () => {
    const { undo, out } = setup();
    expect(await undo.onPress(press("h:1"))).toBe(false);
    expect(await undo.onPress({ id: "q", from: ADMIN })).toBe(false);
    expect(out.log).toEqual([]);
  });

  it("ignores, with only a silent answer, a press outside the admin chat, for a chat not allow-listed, a forged one or one past the limit", async () => {
    const quiet = [
      { q: press(x("b"), { chat: GROUP }) },
      { q: press(x("b", MEMBER_ID, -1005555555555)) },
      { q: press(x("b"), { markup: { inline_keyboard: [[{ text: "Unmute", callback_data: x("m") }]] } }) },
      { q: press(x("b"), { markup: { inline_keyboard: [] } }) },
      { q: press(x("b")), limited: true },
    ];
    for (const { q, limited } of quiet) {
      const { undo, out, records } = setup({ press: !limited });
      expect(await undo.onPress(q)).toBe(true);
      expect(out.log.map((c) => [c.op, ...c.args])).toEqual([["answerPress", "press-1", undefined]]);
      expect(records.isTrusted(GROUP_ID, MEMBER_ID)).toBe(false);
    }
  });

  it("checks the press limit before any other call to Telegram", async () => {
    const { undo, limits, out } = setup({ press: false });
    await undo.onPress(press(x("m")));
    expect(limits.press).toHaveBeenCalledWith(ADMIN.id, NOW);
    expect(out.log.map((c) => c.op)).toEqual(["answerPress"]);
  });

  it("refuses, with a toast, a press from someone without the right, and tells an anonymous admin why", async () => {
    const cases: Array<[TgUser, string, string]> = [
      [TITLE_ONLY, x("b"), testWords.admin.noRight],
      [DELETE_ONLY, x("m"), testWords.admin.noRight],
      [STRANGER, x("h", 0), testWords.admin.noRight],
      [STRANGER, "x:h:0:0", testWords.admin.noRight],
      [ANONYMOUS, x("t"), testWords.admin.anonymous],
      [ANONYMOUS, "x:h:0:0", testWords.admin.anonymous],
    ];
    for (const [from, data, toast] of cases) {
      const { undo, calls } = setup();
      expect(await undo.onPress(press(data, { from }))).toBe(true);
      expect(calls()).toEqual([["answerPress", "press-1", toast]]);
    }
  });

  it("reads only well-formed data", () => {
    expect(parsePress(x("b0"))).toEqual({ action: "b0", chat: GROUP_ID, target: MEMBER_ID });
    expect(parsePress("x:h:0:0")).toEqual({ action: "h", chat: 0, target: 0 });
    for (const bad of ["x:b", "x:b:1:2:3", "x:zz:-1001:1", "x:constructor:-1001:1", "x:b:0:101", "x:b:-1001:0", "x:r:-1001:5", "x:b:1001:101", "x:b:-1001:1e3", "y:b:-1001:1"]) {
      expect(parsePress(bad)).toBeNull();
    }
  });
});

describe("createUndo: the actions", () => {
  it("calls the matching CommunityOut method for each action, then says it's done, and takes a used Unmute or Unban off the alert", async () => {
    const leave = ["edit", ADMIN_CHAT_ID, ALERT_ID, TEXT_HTML, undefined];
    const expected: Array<[string, unknown[], unknown[][]]> = [
      [x("m"), ["restrict", GROUP_ID, MEMBER_ID, LIFTED, 0], [leave]],
      [x("b0"), ["unban", GROUP_ID, MEMBER_ID], [leave]],
      [x("b"), ["ban", GROUP_ID, MEMBER_ID], []],
      [x("d", 42), ["remove", GROUP_ID, [42]], []],
      [x("q"), ["restrict", GROUP_ID, MEMBER_ID, MUTED, Math.floor(NOW / 1000) + 3_600], []],
    ];
    for (const [data, call, after] of expected) {
      const { undo, calls } = setup();
      await undo.onPress(press(data));
      expect(calls()).toEqual([call, ["answerPress", "press-1", testWords.admin.done], ...after]);
    }
  });

  it("lets a Delete-only admin delete", async () => {
    const { undo, calls } = setup();
    await undo.onPress(press(x("d", 42), { from: DELETE_ONLY }));
    expect(calls()[0]).toEqual(["remove", GROUP_ID, [42]]);
  });

  it("undoes a warning by removing the latest offence", async () => {
    const { undo, records, calls } = setup();
    records.addOffence(GROUP_ID, MEMBER_ID, NOW, "invite_link", true);
    records.addOffence(GROUP_ID, MEMBER_ID, NOW, "invite_link", true);
    await undo.onPress(press(x("u")));
    expect(records.offences(GROUP_ID, MEMBER_ID, NOW).n).toBe(1);
    expect(calls()).toEqual([["answerPress", "press-1", testWords.admin.done], ["edit", ADMIN_CHAT_ID, ALERT_ID, TEXT_HTML, undefined]]);
  });

  it("ends raid mode only while it is on", async () => {
    const on = setup({ raid: true });
    await on.undo.onPress(press(x("r", 0)));
    expect(on.raid.end).toHaveBeenCalledWith(GROUP_ID, NOW);
    const off = setup({ raid: false });
    await off.undo.onPress(press(x("r", 0)));
    expect(off.raid.end).not.toHaveBeenCalled();
    expect(off.calls()).toEqual([["answerPress", "press-1", testWords.admin.done]]);
  });

  it("trusts with the member's current name fingerprint and lifts any restriction", async () => {
    const { undo, records, calls } = setup({ name: "Sam Smith" });
    await undo.onPress(press(x("t")));
    expect(records.trustedName(GROUP_ID, MEMBER_ID, nameHash("Sam Smith"))).toBe(true);
    expect(records.trustedName(GROUP_ID, MEMBER_ID, nameHash("Sam Support"))).toBe(false);
    expect(calls()).toEqual([["restrict", GROUP_ID, MEMBER_ID, LIFTED, 0], ["answerPress", "press-1", testWords.admin.done], ["edit", ADMIN_CHAT_ID, ALERT_ID, TEXT_HTML, undefined]]);
  });

  it("trusts nobody whose name Telegram can't give, and says when a call failed", async () => {
    for (const name of [null, new Error("getChatMember failed")]) {
      const nameless = setup({ name });
      expect(await nameless.undo.onPress(press(x("t")))).toBe(true);
      expect(nameless.records.isTrusted(GROUP_ID, MEMBER_ID)).toBe(false);
      expect(nameless.calls()).toEqual([["answerPress", "press-1", testWords.check.retry]]);
    }
    const refused = setup({ out: { ban: async () => false } });
    await refused.undo.onPress(press(x("b")));
    expect(refused.calls()).toEqual([["ban", GROUP_ID, MEMBER_ID], ["answerPress", "press-1", testWords.check.retry]]);
  });

  it("marks an alert handled, answering first: the same text, the admin's name under it, and no buttons", async () => {
    const { undo, calls } = setup();
    await undo.onPress(press(x("h", 0), { from: TITLE_ONLY }));
    const html = `${TEXT_HTML}\n\nHandled by Tia`;
    expect(calls()).toEqual([["answerPress", "press-1", testWords.admin.done], ["edit", ADMIN_CHAT_ID, ALERT_ID, html, undefined]]);
  });

  it("lets an admin of any community group handle an alert about no group", async () => {
    const { undo, calls } = setup();
    await undo.onPress(press("x:h:0:0"));
    expect(calls().map((c) => c[0])).toEqual(["answerPress", "edit"]);
  });
});

describe("messageHtml", () => {
  it("escapes the text and nests overlapping formatting", () => {
    const text = "Urgent a<b & c";
    const entities = [{ type: "underline", offset: 0, length: 6 }, { type: "bold", offset: 0, length: 6 }, { type: "italic", offset: 7, length: 7 }, { type: "code", offset: 9, length: 2 }];
    expect(messageHtml(text, entities)).toBe("<b><u>Urgent</u></b> <i>a&lt;</i><code>b </code><i>&amp; c</i>");
  });

  it("ignores entities that don't fit the text", () => {
    expect(messageHtml("abc", [{ type: "bold", offset: 2, length: 9 }, { type: "bold", offset: -1, length: 2 }, { type: "italic", offset: 5, length: 1 }])).toBe("ab<b>c</b>");
  });
});
