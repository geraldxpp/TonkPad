import { describe, expect, it } from "vitest";
import { checkSetup, retryingReader } from "../src/telegram/community/setup";
import { ADMIN_CHAT_ID, BOT_ID, GROUP_ID, OWNER_ID, testWords } from "./community-fixtures";
import { bench, but, READY, SECOND_GROUP, WEEK_S } from "./community-setup-fixtures";

describe("checkSetup", () => {
  it("passes a community set up as the brief says, quietly", async () => {
    const { deps, alerts, waits } = bench();
    expect(await checkSetup(deps)).toEqual({ chats: [GROUP_ID, SECOND_GROUP], adminChat: "ok", adminChatOk: true, unsure: [], gone: [], autoDelete: "ok", notes: [] });
    expect(alerts).toEqual([]);
    expect(waits).toEqual([]);
  });

  it("drops a group no owner controls, with a note and an alert", async () => {
    const { deps, alerts } = bench(but(SECOND_GROUP, OWNER_ID, { status: "administrator", can_delete_messages: true }));
    const result = await checkSetup(deps);
    expect(result.chats).toEqual([GROUP_ID]);
    expect(result.notes).toEqual([`community group ${SECOND_GROUP} dropped: no owner (TELEGRAM_OWNER_IDS) is its creator or an admin with Ban users`]);
    expect(alerts).toEqual([expect.objectContaining({ chat: SECOND_GROUP, kind: "setup", done: "No owner is an admin of tonkfun·fun community.", routine: false })]);
    const left = await checkSetup(bench(but(GROUP_ID, OWNER_ID, { status: "left" })).deps);
    expect(left.chats).toEqual([SECOND_GROUP]);
  });

  it("cleans a dropped group's title in its alert, so a link, an @handle or a command in it is never live, and falls back to its ID", async () => {
    const places = but(SECOND_GROUP, OWNER_ID, { status: "left" });
    const hostile = bench(places, { chats: { [SECOND_GROUP]: { title: "Claim at claim.evil.xyz, DM @scam_support or /start" } } });
    await checkSetup(hostile.deps);
    expect(hostile.alerts.map((a) => a.done)).toEqual(["No owner is an admin of Claim at claim·evil·xyz, DM scam_support or start."]);
    const unread = bench(places, { chats: { [SECOND_GROUP]: null } });
    await checkSetup(unread.deps);
    expect(unread.alerts.map((a) => a.done)).toEqual([`No owner is an admin of ${SECOND_GROUP}.`]);
  });

  it("drops a group where the bot lacks a right it needs, and keeps one whose rights can't be read, as unsure", async () => {
    const { deps, alerts } = bench(but(GROUP_ID, BOT_ID, { status: "administrator", can_delete_messages: true }));
    const result = await checkSetup(deps);
    expect(result.chats).toEqual([SECOND_GROUP]);
    expect(result.notes).toEqual([`community group ${GROUP_ID} dropped: the bot lacks Ban users there`]);
    expect(alerts).toEqual([expect.objectContaining({ chat: GROUP_ID, kind: "rights", done: "I'm missing a right in tonkfun·fun community." })]);
    const unknown = bench(but(SECOND_GROUP, BOT_ID, null));
    const unread = await checkSetup(unknown.deps);
    // A read Telegram couldn't answer is no "no": the group runs, and is checked again from the tick.
    expect(unread).toMatchObject({ chats: [GROUP_ID, SECOND_GROUP], unsure: [SECOND_GROUP], adminChat: "ok" });
    expect(unread.notes).toEqual([`community group ${SECOND_GROUP}: its checks can't be read yet (is the bot in it?); it runs, and they are tried again shortly`]);
    expect(unknown.alerts).toEqual([]);
  });

  it("tries a failed read again after 1 and 2 seconds before it decides anything", async () => {
    let fails = 2;
    const { deps, alerts, waits } = bench();
    const member = deps.out.member;
    deps.out.member = async (chat, user) => (chat === GROUP_ID && user === BOT_ID && fails-- > 0 ? null : member(chat, user));
    expect(await checkSetup(deps)).toMatchObject({ chats: [GROUP_ID, SECOND_GROUP], unsure: [], adminChat: "ok" });
    expect(waits).toEqual([1_000, 2_000]);
    expect(alerts).toEqual([]);
  });

  it("turns community mode off for an admin chat with a public username, and alerts nobody", async () => {
    const { deps, alerts } = bench(but(GROUP_ID, BOT_ID, { status: "member" }), { chats: { [ADMIN_CHAT_ID]: { username: "tonkteam" } } });
    const result = await checkSetup(deps);
    expect(result).toMatchObject({ chats: [], adminChat: "off", adminChatOk: false, unsure: [] });
    expect(result.notes).toContain("the admin chat has a public username: make it private");
    expect(result.notes).toContain("community mode off: the admin chat failed its checks");
    expect(alerts).toEqual([]);
  });

  it("turns community mode off when no owner is in the admin chat, and runs, unsure, when it can't be read", async () => {
    const away = await checkSetup(bench(but(ADMIN_CHAT_ID, OWNER_ID, { status: "left" })).deps);
    expect(away).toMatchObject({ chats: [], adminChat: "off", adminChatOk: false });
    expect(away.notes[0]).toBe("no owner (TELEGRAM_OWNER_IDS) is a member of the admin chat");
    const unread = bench(READY, { chats: { [ADMIN_CHAT_ID]: null } });
    const result = await checkSetup(unread.deps);
    expect(result).toMatchObject({ chats: [GROUP_ID, SECOND_GROUP], adminChat: "unsure", adminChatOk: true, autoDelete: null });
    expect(result.notes[0]).toContain("the admin chat can't be read yet");
    expect(unread.waits).toEqual([1_000, 2_000]);
    const ownerUnread = await checkSetup(bench(but(ADMIN_CHAT_ID, OWNER_ID, null)).deps);
    expect(ownerUnread).toMatchObject({ adminChat: "unsure", adminChatOk: true });
  });

  it("turns community mode off when the Security page has no contact, and runs when it can't be read", async () => {
    const { deps, alerts } = bench(READY, { extra: { contact: "none" } });
    expect(await checkSetup(deps)).toEqual({ chats: [], adminChat: "ok", adminChatOk: true, unsure: [], gone: [], autoDelete: "ok", notes: ["community mode off: the site's Security page has no contact"] });
    expect(alerts).toEqual([expect.objectContaining({ chat: null, kind: "setup", done: "The Security page has no contact." })]);
    const unknown = await checkSetup(bench(READY, { extra: { contact: "unknown" } }).deps);
    expect(unknown.chats).toEqual([GROUP_ID, SECOND_GROUP]);
    expect(unknown.notes).toHaveLength(1);
  });

  it("alerts once when the admin chat's auto-delete is off or longer than a week, and not for a week or less", async () => {
    for (const timer of [undefined, 0, WEEK_S + 1, 30 * 24 * 60 * 60]) {
      const { deps, alerts } = bench(READY, { chats: { [ADMIN_CHAT_ID]: { message_auto_delete_time: timer } } });
      const result = await checkSetup(deps);
      expect(result, String(timer)).toMatchObject({ autoDelete: "long", adminChat: "ok", chats: [GROUP_ID, SECOND_GROUP] });
      expect(alerts, String(timer)).toEqual([expect.objectContaining({ chat: null, kind: "setup", done: testWords.admin.setup.autoDelete, routine: false })]);
    }
    for (const timer of [60 * 60, 24 * 60 * 60, WEEK_S]) {
      const { deps, alerts } = bench(READY, { chats: { [ADMIN_CHAT_ID]: { message_auto_delete_time: timer } } });
      expect((await checkSetup(deps)).autoDelete, String(timer)).toBe("ok");
      expect(alerts).toEqual([]);
    }
  });
});

describe("retryingReader", () => {
  it("shares one budget of waits between every read of a round, and never throws", async () => {
    const waits: number[] = [];
    const read = retryingReader([1_000, 2_000, 4_000], async (ms) => void waits.push(ms));
    // 4 more seconds would pass the round's 6: given up after 3.
    expect(await read(async () => null)).toBeNull();
    expect(waits).toEqual([1_000, 2_000]);
    expect(await read(async () => Promise.reject(new Error("network")))).toBeNull();
    expect(waits).toEqual([1_000, 2_000, 1_000, 2_000]);
    // The 6 seconds are spent: one try each from now on.
    expect(await read(async () => null)).toBeNull();
    expect(waits).toHaveLength(4);
    let n = 0;
    expect(await retryingReader([1_000], async () => undefined)(async () => (n += 1) > 1 ? "ok" : null)).toBe("ok");
  });
});
