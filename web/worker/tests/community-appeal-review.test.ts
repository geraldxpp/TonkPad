import { describe, expect, it } from "vitest";
import type { AiLimits } from "../src/telegram/claude/types";
import { createAppeals } from "../src/telegram/community/appeal";
import type { AdminAlert, ChatId } from "../src/telegram/community/types";
import type { InlineKeyboard, TgCallbackQuery, TgChat, TgChatMember, TgMessage, TgUser } from "../src/telegram/types";
import { BOT, callsOf, GROUP, GROUP_ID, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** Who may ask for a review (abuse#17), and the answers to presses the reviews take and go no further with (telegram#6). */

const seconds = (ms: number) => Math.floor(ms / 1000);
const PRIVATE: TgChat = { id: MEMBER.id, type: "private" };
const member = (user: TgUser): TgChatMember => ({ status: "member", user });
const left = (user: TgUser): TgChatMember => ({ status: "left", user });
const muted = (user: TgUser): TgChatMember => ({ status: "restricted", user, is_member: true, can_send_messages: false, until_date: seconds(NOW + 3_600_000) });
const textOnly = (user: TgUser): TgChatMember => ({ ...muted(user), can_send_messages: true });
const banned = (user: TgUser): TgChatMember => ({ status: "kicked", user, until_date: 0 });

function setup(options: { standing?: TgChatMember | null; press?: boolean; member?: () => Promise<TgChatMember | null> } = {}) {
  const standing = options.standing === undefined ? member(MEMBER) : options.standing;
  const out = recordOut({ member: options.member ?? (async () => standing) });
  const records = memoryRecords();
  const alerts: AdminAlert[] = [];
  const limits: AiLimits = { answer: () => "ok", proactive: () => true, triage: () => true, report: () => true, press: () => options.press ?? true, coolDown: () => false, busyReply: () => true, prune: () => undefined };
  const appeals = createAppeals({
    out, records, limits,
    alerts: { alert: (a) => void alerts.push(a) },
    chats: [GROUP_ID],
    groupTitle: (chat: ChatId) => (chat === GROUP_ID ? "tonkfun.fun community" : "Group"),
    words: () => testWords,
    now: () => NOW,
  });
  return { out, records, alerts, appeals };
}

/** A press on the review view in the member's private chat, which holds this button. */
function press(data = `ap:${GROUP_ID}`, options: { chat?: TgChat; from?: TgUser; id?: string } = {}): TgCallbackQuery {
  const keyboard: InlineKeyboard = { inline_keyboard: [[{ text: "Ask a person to review", callback_data: data }]] };
  const message: TgMessage = { message_id: 600, date: seconds(NOW), chat: options.chat ?? PRIVATE, from: BOT, text: "Your status", reply_markup: keyboard };
  return { id: options.id ?? "q1", from: options.from ?? MEMBER, data, message };
}

describe("a review request", () => {
  it("reaches the admins only with a mute, a ban or an offence on record there", async () => {
    for (const standing of [muted(MEMBER), banned(MEMBER)]) {
      const s = setup({ standing });
      await s.appeals.onPress(press());
      expect(s.alerts).toHaveLength(1);
    }
    const warned = setup();
    warned.records.addOffence(GROUP_ID, MEMBER.id, NOW, "invite_link", false);
    await warned.appeals.onPress(press());
    expect(warned.alerts.map((a) => [a.undo, a.standing])).toEqual([["warn", "none"]]);
  });

  it("never alerts for a new member's text-only days, and never offers Unmute for them (admin-privacy-docs#8)", async () => {
    // A farm of fresh accounts that passed the check: each is text-only for its first days, with nothing on record.
    const fresh = setup({ standing: textOnly(MEMBER) });
    expect(await fresh.appeals.onPress(press())).toBe(true);
    expect(fresh.alerts).toEqual([]);
    expect(callsOf(fresh.out.log, "answerPress")).toEqual([["q1", "tonkfun·fun community: some messages are limited."]]);
    expect(fresh.records.appealAt(GROUP_ID, MEMBER.id)).toBeNull();
    expect(fresh.records.counts(GROUP_ID, NOW).appeals).toBe(0);
    // With an offence on record, the review offers the warning's Undo, never Unmute.
    const warned = setup({ standing: textOnly(MEMBER) });
    warned.records.addOffence(GROUP_ID, MEMBER.id, NOW, "newcomer_link", false);
    await warned.appeals.onPress(press());
    expect(warned.alerts.map((a) => [a.undo, a.standing])).toEqual([["warn", "restricted"]]);
  });

  it("from someone in good standing, or who was never in the group, says so and sends and keeps nothing", async () => {
    for (const standing of [member(MEMBER), left(MEMBER)]) {
      const s = setup({ standing });
      expect(await s.appeals.onPress(press())).toBe(true);
      expect(s.alerts).toEqual([]);
      expect(callsOf(s.out.log, "answerPress")).toEqual([["q1", "tonkfun·fun community: nothing is restricted."]]);
      expect(s.records.appealAt(GROUP_ID, MEMBER.id)).toBeNull();
      expect(s.records.counts(GROUP_ID, NOW).appeals).toBe(0);
    }
  });

  it("asks to try again, keeping nothing, when Telegram can't say and nothing is on record", async () => {
    const s = setup({ standing: null });
    await s.appeals.onPress(press());
    expect(s.alerts).toEqual([]);
    expect(callsOf(s.out.log, "answerPress")).toEqual([["q1", testWords.check.retry]]);
    expect(s.records.appealAt(GROUP_ID, MEMBER.id)).toBeNull();
  });

  it("sends one alert for two quick presses, and tells the second to wait", async () => {
    let answer: (m: TgChatMember) => void = () => undefined;
    const s = setup({ member: () => new Promise((resolve) => (answer = resolve)) });
    const first = s.appeals.onPress(press());
    const second = s.appeals.onPress(press(`ap:${GROUP_ID}`, { id: "q2" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer(muted(MEMBER));
    await Promise.all([first, second]);
    expect(s.alerts).toHaveLength(1);
    expect(callsOf(s.out.log, "answerPress")).toContainEqual(["q2", undefined]);
    expect(callsOf(s.out.log, "answerPress")).toContainEqual(["q1", testWords.appeal.sent]);
  });
});

describe("presses the reviews take and go no further with", () => {
  it("are answered silently: past the press limit, forged, elsewhere, or for a group not allow-listed", async () => {
    const quiet = [
      { q: press(), limited: true },
      { q: { ...press(), data: "ap:-1005555555555" } },
      { q: press(`ap:${GROUP_ID}`, { chat: GROUP }) },
      { q: press(`ap:${GROUP_ID}`, { from: { id: 999, first_name: "Someone else" } }) },
      { q: press("ap:-1005555555555") },
    ];
    for (const { q, limited } of quiet) {
      const s = setup({ standing: muted(MEMBER), press: !limited });
      expect(await s.appeals.onPress(q)).toBe(true);
      expect(callsOf(s.out.log, "answerPress")).toEqual([[q.id, undefined]]);
      expect(s.alerts).toEqual([]);
    }
  });
});
