import { describe, expect, it } from "vitest";
import { LIFTED } from "../src/telegram/community/permissions";
import { nameHash } from "../src/telegram/mod/names";
import type { TgMessage, TgUser } from "../src/telegram/types";
import { BOT, callsOf, GROUP, GROUP_ID, MEMBER } from "./community-fixtures";
import { ANONYMOUS, adminSends, BANNER, command, controlsBench as setup, inGroup, OWNER, removed, replyTo, TITLED } from "./community-controls-fixtures";
import { NOW } from "./fixtures";

describe("controls in a community group", () => {
  it("lets an owner pause and resume answers, deletes each command and confirms with who", async () => {
    const s = setup();
    const pause = inGroup("/pause", OWNER);
    expect(await command(s, pause)).toBe(true);
    expect(s.records.settings(GROUP_ID).paused).toBe(true);
    await command(s, inGroup("/resume", OWNER));
    expect(s.records.settings(GROUP_ID).paused).toBe(false);
    expect(removed(s)).toContain(pause.message_id);
    expect(s.alerts.map((a) => [a.kind, a.chat, a.routine, a.done])).toEqual([
      ["control", GROUP_ID, true, "Olive Owner (olive_owner) paused answers in tonkfun·fun community."],
      ["control", GROUP_ID, true, "Olive Owner (olive_owner) resumed answers in tonkfun·fun community."],
    ]);
  });

  it("cleans the admin's name and the group's title in a confirmation, which the alerts take as the bot's own words", async () => {
    const s = setup();
    const owner: TgUser = { ...OWNER, first_name: "Eve @scam", last_name: "t.me/x", username: "eve_x" };
    await command(s, inGroup("/pause", owner, { chat: { ...GROUP, title: "Official: claim at evil.xyz/#win" } }));
    expect(s.alerts[0].done).toBe("Eve scam t·mex (eve_x) paused answers in Official claim at evil·xyzwin.");
  });

  it("sets strictness and unprompted answers for an owner", async () => {
    const s = setup();
    await command(s, inGroup("/strict normal", OWNER));
    await command(s, inGroup("/proactive off", OWNER));
    expect(s.records.settings(GROUP_ID)).toMatchObject({ strictness: "normal", proactive: false });
    expect(s.alerts.map((a) => a.done)).toEqual([
      "Olive Owner (olive_owner) set tonkfun·fun community to Level normal.",
      "Olive Owner (olive_owner) turned unprompted answers off in tonkfun·fun community.",
    ]);
  });

  it("refuses owner-only commands to an admin with Ban users, silently", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "flood", false);
    for (const text of ["/pause", "/proactive off", "/strict strict", "/forget 101"]) await command(s, inGroup(text, BANNER));
    await command(s, inGroup("/forget", BANNER, { reply_to_message: replyTo(MEMBER) }));
    expect(s.records.settings(GROUP_ID)).toEqual({ paused: false, proactive: true, strictness: "observe", raidUntil: 0 });
    expect(s.records.offences(GROUP_ID, MEMBER.id, NOW).n).toBe(1);
    expect(s.alerts).toEqual([]);
    expect(removed(s)).toHaveLength(5);
    expect(adminSends(s)).toEqual([]);
  });

  it("refuses raid mode and trust to an admin with only a title", async () => {
    const s = setup();
    await command(s, inGroup("/raid on", TITLED));
    await command(s, inGroup("/trust", TITLED, { reply_to_message: replyTo(MEMBER) }));
    await command(s, inGroup("/trusted", TITLED));
    expect(s.raid.log).toEqual([]);
    expect(s.records.isTrusted(GROUP_ID, MEMBER.id)).toBe(false);
    expect(callsOf(s.out.log, "restrict")).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(adminSends(s)).toEqual([]);
  });

  it("lets an admin with Ban users start and end raid mode, once each", async () => {
    const s = setup();
    await command(s, inGroup("/raid on", BANNER));
    await command(s, inGroup("/raid on", BANNER));
    await command(s, inGroup("/raid off", BANNER));
    expect(s.raid.log).toEqual(["start:admin", "end"]);
    expect(s.alerts.map((a) => a.done)).toEqual([
      "Bea (bea_bans) started raid mode in tonkfun·fun community.",
      "Bea (bea_bans) started raid mode in tonkfun·fun community.",
      "Bea (bea_bans) ended raid mode in tonkfun·fun community.",
    ]);
  });

  it("trusts the member replied to with their name's fingerprint, lifts any restriction, and untrusts", async () => {
    const s = setup();
    const member: TgUser = { ...MEMBER, last_name: "Lee", username: "sam_lee" };
    await command(s, inGroup("/trust", BANNER, { reply_to_message: replyTo(member) }));
    expect(s.records.isTrusted(GROUP_ID, member.id)).toBe(true);
    expect(s.records.trustedName(GROUP_ID, member.id, nameHash("Sam Lee"))).toBe(true);
    expect(callsOf(s.out.log, "restrict")).toEqual([[GROUP_ID, member.id, LIFTED, 0]]);
    expect(s.alerts[0]).toMatchObject({ kind: "control", member: { id: null, name: "Sam Lee", username: "sam_lee" }, done: "Bea (bea_bans) trusted a member in tonkfun·fun community." });
    await command(s, inGroup("/untrust", BANNER, { reply_to_message: replyTo(member) }));
    expect(s.records.isTrusted(GROUP_ID, member.id)).toBe(false);
    expect(s.alerts[1].done).toBe("Bea (bea_bans) stopped trusting a member in tonkfun·fun community.");
  });

  it("drops a newcomer's waiting check on trust, so its timeout can't remove them", async () => {
    const s = setup();
    s.records.setPending({ chat: GROUP_ID, user: MEMBER.id, messageId: 77, joinMessageId: 76, deadline: NOW + 60_000, target: null, tries: 0 });
    await command(s, inGroup("/trust", BANNER, { reply_to_message: replyTo(MEMBER) }));
    expect(s.records.pending(GROUP_ID, MEMBER.id)).toBeNull();
    expect(removed(s)).toContain(77);
  });

  it("notes a trust that replies to nothing, a bot or a topic's root", async () => {
    const s = setup();
    const root: TgMessage = { message_id: 5, date: 0, chat: GROUP, forum_topic_created: {} };
    await command(s, inGroup("/trust", BANNER));
    await command(s, inGroup("/trust", BANNER, { reply_to_message: replyTo(BOT) }));
    await command(s, inGroup("/trust", BANNER, { reply_to_message: root, is_topic_message: true, message_thread_id: 5 }));
    expect(s.alerts.map((a) => a.done)).toEqual(Array(3).fill("Bea (bea_bans) used a command in tonkfun·fun community without replying to a message."));
    expect(callsOf(s.out.log, "restrict")).toEqual([]);
  });

  it("deletes a member's command and does nothing else", async () => {
    const s = setup();
    const m = inGroup("/pause", MEMBER);
    expect(await command(s, m)).toBe(true);
    expect(s.out.log.map((c) => c.op)).toEqual(["remove"]);
    expect(removed(s)).toEqual([m.message_id]);
    expect(s.records.settings(GROUP_ID).paused).toBe(false);
    expect(s.alerts).toEqual([]);
  });

  it("refuses an anonymous admin with a note in the admin chat", async () => {
    const s = setup();
    const m = inGroup("/strict strict", ANONYMOUS, { sender_chat: GROUP });
    expect(await command(s, m)).toBe(true);
    expect(removed(s)).toEqual([m.message_id]);
    expect(s.records.settings(GROUP_ID).strictness).toBe("observe");
    expect(s.alerts).toEqual([expect.objectContaining({ kind: "control", chat: GROUP_ID, done: "Anonymous admins can't use the controls.", routine: true })]);
  });

  it("sends the panel when a switch gets a value it doesn't know", async () => {
    const s = setup();
    await command(s, inGroup("/strict medium", OWNER));
    expect(s.records.settings(GROUP_ID).strictness).toBe("observe");
    expect(s.alerts).toEqual([]);
    expect(adminSends(s)).toHaveLength(1);
    expect(adminSends(s)[0][1]).toBe(`Status of ${GROUP_ID}`);
  });

  it("leaves other commands and other chats alone", async () => {
    const s = setup();
    expect(await command(s, inGroup("/check 0xabc", OWNER))).toBe(false);
    expect(await command(s, inGroup("/ai off", OWNER))).toBe(false);
    expect(await command(s, inGroup("/pause", OWNER, { chat: { id: -1005555555555, type: "supergroup" } }))).toBe(false);
    expect(s.out.log).toEqual([]);
    expect(s.alerts).toEqual([]);
  });
});
