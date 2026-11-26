import { describe, expect, it } from "vitest";
import { createBudget } from "../src/telegram/claude/budget";
import { createAlerts } from "../src/telegram/community/alerts";
import type { InlineKeyboard } from "../src/telegram/types";
import { ADMIN_CHAT_ID, callsOf, GROUP, GROUP_ID, MEMBER, memoryRecords, testWords } from "./community-fixtures";
import {
  adminPress, adminSends, BANNER, command, controlsBench as setup, HOURS_47, inAdminChat, inGroup, OWNER, replyTo, TITLED,
} from "./community-controls-fixtures";
import { NOW } from "./fixtures";

describe("controls in the admin chat", () => {
  it("sends /status and /trusted there, named and with IDs, deleted after 47 hours", async () => {
    const s = setup();
    await command(s, inGroup("/trust", BANNER, { reply_to_message: replyTo({ ...MEMBER, username: "sam_x" }) }));
    await command(s, inGroup("/trusted", BANNER));
    await command(s, inGroup("/status", TITLED));
    const [trusted, status] = adminSends(s);
    expect(trusted[1]).toBe("<b>List trusted members</b> · tonkfun·fun community\n• Member <code>101</code>");
    expect(status[1]).toBe(`Status of ${GROUP_ID}`);
    expect(callsOf(s.out.log, "removeLater")).toEqual([[ADMIN_CHAT_ID, 5001, HOURS_47], [ADMIN_CHAT_ID, 5002, HOURS_47]]);
  });

  it("names trusted members as Telegram shows them now, and lists those it can't name by ID", async () => {
    const sam = { id: 101, is_bot: false, first_name: "Sam", username: "sam_x" };
    const s = setup({ out: { member: async (_chat, user) => (user === sam.id ? { status: "member", user: sam } : null) } });
    s.records.trust(GROUP_ID, sam.id, "0123456789abcdef", NOW);
    s.records.trust(GROUP_ID, 102, "0123456789abcdef", NOW);
    await command(s, inGroup("/trusted", BANNER));
    expect(adminSends(s)[0][1]).toBe("<b>List trusted members</b> · tonkfun·fun community\n• Sam (<code>sam_x</code>) <code>101</code>\n• <code>102</code>");
  });

  it("confirms through the alerts in plain words, escaped once", async () => {
    const s = setup({ alerts: (out, records) => createAlerts({ out, records, adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "A & B" }) });
    await command(s, inGroup("/pause", { ...OWNER, first_name: "Olive <b>" }));
    const [[chat, html]] = adminSends(s);
    expect(chat).toBe(ADMIN_CHAT_ID);
    expect(html).toContain("Done: Olive &lt;b&gt; Owner (olive_owner) paused answers in tonkfun·fun community.");
    expect(html).not.toContain("&amp;lt;");
  });

  it("turns AI off and on for an owner, saved through the budget", async () => {
    const records = memoryRecords();
    const budget = createBudget({ capUsd: 3, saved: null, off: null, save: () => undefined, saveOff: (v) => records.setAiOff(v), onEvent: () => undefined, now: () => NOW });
    const s = setup({ budget });
    expect(await command(s, inAdminChat("/ai off", OWNER))).toBe(true);
    expect(budget.status(NOW).on).toBe(false);
    expect(records.aiOff()).toEqual({ reason: "admin", since: NOW });
    expect(s.alerts[0]).toMatchObject({ kind: "control", chat: null, done: "Olive Owner (olive_owner) turned AI off." });
    await command(s, inAdminChat("/ai on", OWNER));
    expect(budget.status(NOW).on).toBe(true);
    expect(records.aiOff()).toBeNull();
  });

  it("refuses /ai and /forget to anyone who isn't an owner", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "flood", false);
    await command(s, inAdminChat("/ai off", BANNER));
    await command(s, inAdminChat("/forget 101", BANNER));
    expect(s.budget.status(NOW).on).toBe(true);
    expect(s.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(1);
    expect(adminSends(s).map((args) => args[1])).toEqual(["Only owners can change this.", "Only owners can change this."]);
  });

  it("forgets a member's records, as a reply in the group or by ID in the admin chat", async () => {
    const s = setup();
    const fill = () => {
      s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "flood", true);
      s.records.trust(GROUP_ID, MEMBER.id, "0123456789abcdef", NOW);
      s.records.markAppeal(GROUP_ID, MEMBER.id, NOW);
    };
    const clean = () => s.records.offences(GROUP_ID, MEMBER.id, NOW).n === 0 && !s.records.isTrusted(GROUP_ID, MEMBER.id) && s.records.appealAt(GROUP_ID, MEMBER.id) === null;
    fill();
    await command(s, inGroup("/forget", OWNER, { reply_to_message: replyTo(MEMBER) }));
    expect(clean()).toBe(true);
    fill();
    await command(s, inAdminChat("/forget 101", OWNER));
    expect(clean()).toBe(true);
    expect(s.alerts.map((a) => a.done)).toEqual([
      "Olive Owner (olive_owner) deleted a member's records in tonkfun·fun community.",
      "Olive Owner (olive_owner) deleted a member's records in Group.",
    ]);
    expect(s.alerts.every((a) => a.member === null)).toBe(true);
  });

  it("sends each group's panel to an admin there", async () => {
    const s = setup();
    await command(s, inAdminChat("/mod", TITLED));
    await command(s, inAdminChat("/mod", MEMBER));
    const sends = adminSends(s);
    expect(sends).toHaveLength(1);
    const keyboard = (sends[0][2] as { keyboard: InlineKeyboard }).keyboard;
    const data = keyboard.inline_keyboard.flat().map((b) => ("callback_data" in b ? b.callback_data : ""));
    expect(data).toEqual(["pause", "proff", "observe", "relaxed", "normal", "strict", "raidon", "aioff"].map((a) => `p:${GROUP_ID}:${a}`));
    expect(keyboard.inline_keyboard[1][0].text).toBe("• Level observe");
  });
});

describe("the panel's buttons", () => {
  it("make an owner's change, confirm it and redraw the panel", async () => {
    const s = setup();
    const q = adminPress(`p:${GROUP_ID}:normal`, OWNER);
    expect(await s.controls.onPress(q)).toBe(true);
    expect(s.records.settings(GROUP_ID).strictness).toBe("normal");
    expect(callsOf(s.out.log, "answerPress")).toEqual([[q.id, "Done"]]);
    const [[chat, messageId, text, keyboard]] = callsOf(s.out.log, "edit") as [[number, number, string, InlineKeyboard]];
    expect([chat, messageId, text]).toEqual([ADMIN_CHAT_ID, 900, `Status of ${GROUP_ID}`]);
    expect(keyboard.inline_keyboard[2][0].text).toBe("• Level normal");
    expect(s.alerts.map((a) => a.done)).toEqual(["Olive Owner (olive_owner) set Group to Level normal."]);
  });

  it("let an admin with Ban users start raid mode but not change modes", async () => {
    const s = setup();
    await s.controls.onPress(adminPress(`p:${GROUP_ID}:raidon`, BANNER));
    await s.controls.onPress(adminPress(`p:${GROUP_ID}:pause`, BANNER));
    expect(s.raid.log).toEqual(["start:admin"]);
    expect(s.records.settings(GROUP_ID).paused).toBe(false);
    expect(callsOf(s.out.log, "answerPress").map((args) => args[1])).toEqual(["Done", "Only owners can change this."]);
  });

  it("ignore forged presses, presses outside the admin chat and groups not allow-listed, answering each silently", async () => {
    const s = setup();
    const forged = { ...adminPress(`p:${GROUP_ID}:pause`, OWNER), data: `p:${GROUP_ID}:aioff` };
    const inGroupChat = adminPress(`p:${GROUP_ID}:pause`, OWNER, undefined, GROUP);
    const otherGroup = adminPress("p:-1005555555555:pause", OWNER);
    const inline = { id: "inline", from: OWNER, data: `p:${GROUP_ID}:pause`, inline_message_id: "AAQ" };
    const presses = [forged, inGroupChat, otherGroup, inline];
    for (const q of presses) expect(await s.controls.onPress(q)).toBe(true);
    // Only the answers that stop each presser's spinner: no toast, nothing changed.
    expect(s.out.log.map((c) => [c.op, ...c.args])).toEqual(presses.map((q) => ["answerPress", q.id, undefined]));
    expect(s.records.settings(GROUP_ID).paused).toBe(false);
    expect(s.budget.status(NOW).on).toBe(true);
    expect(await s.controls.onPress(adminPress("x:h:1:2", OWNER))).toBe(false);
  });

  it("stop at the press limit before any other call, answering the press silently", async () => {
    const s = setup({ pressMax: 1 });
    await s.controls.onPress(adminPress(`p:${GROUP_ID}:pause`, OWNER));
    const calls = s.out.log.length;
    await s.controls.onPress(adminPress(`p:${GROUP_ID}:resume`, OWNER));
    expect(s.out.log.slice(calls).map((c) => [c.op, ...c.args])).toEqual([["answerPress", `press_p:${GROUP_ID}:resume`, undefined]]);
    expect(s.records.settings(GROUP_ID).paused).toBe(true);
  });
});
