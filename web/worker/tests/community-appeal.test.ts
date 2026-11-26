import { describe, expect, it } from "vitest";
import type { AiLimits } from "../src/telegram/claude/types";
import { createAlerts } from "../src/telegram/community/alerts";
import { createAppeals, standingOf } from "../src/telegram/community/appeal";
import type { AdminAlert, ChatId } from "../src/telegram/community/types";
import type { InlineKeyboard, TgCallbackQuery, TgChat, TgChatMember, TgMessage, TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, BOT, callsOf, GROUP, GROUP_ID, groupMessage, MEMBER, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

const SECOND_GROUP = -1005555555555;
const DAY = 24 * 60 * 60 * 1000;
const seconds = (ms: number) => Math.floor(ms / 1000);
const PRIVATE: TgChat = { id: MEMBER.id, type: "private" };
const TITLES: Record<number, string> = { [GROUP_ID]: "tonkfun.fun community", [SECOND_GROUP]: "tonkfun.fun Español" };

const muted = (user: TgUser): TgChatMember => ({ status: "restricted", user, is_member: true, can_send_messages: false, until_date: seconds(NOW + 3_600_000) });
const banned = (user: TgUser): TgChatMember => ({ status: "kicked", user, until_date: 0 });

/** Press limits that count, with no window. */
function countingLimits(max = 8): AiLimits {
  const used = new Map<number, number>();
  return {
    answer: () => "ok",
    proactive: () => true,
    triage: () => true,
    report: () => true,
    press(user) {
      const n = used.get(user) ?? 0;
      used.set(user, n + 1);
      return n < max;
    },
    coolDown: () => false,
    busyReply: () => true,
    prune: () => undefined,
  };
}

function setup(options: { chats?: ChatId[]; member?: (chat: ChatId, user: number) => TgChatMember | null } = {}) {
  let now = NOW;
  const member = options.member ?? ((_chat: ChatId, user: number) => ({ status: "member" as const, user: { id: user, first_name: "Member" } }));
  const out = recordOut({ member: async (chat, user) => member(chat, user) });
  const records = memoryRecords();
  const alerts: AdminAlert[] = [];
  const appeals = createAppeals({
    out, records, limits: countingLimits(),
    alerts: { alert: (a) => void alerts.push(a) },
    chats: options.chats ?? [GROUP_ID],
    groupTitle: (chat) => TITLES[chat] ?? "Group",
    words: () => testWords,
    now: () => now,
  });
  return { out, records, alerts, appeals, later: (ms: number) => void (now += ms) };
}

const start = (): TgMessage => groupMessage("/start appeal", { chat: PRIVATE });

/** A press on the review view in the member's private chat, which holds these buttons. */
function press(data: string, options: { from?: TgUser; chat?: TgChat; buttons?: string[] } = {}): TgCallbackQuery {
  const keyboard: InlineKeyboard = { inline_keyboard: [(options.buttons ?? [data]).map((d) => ({ text: d, callback_data: d }))] };
  const message: TgMessage = { message_id: 600, date: seconds(NOW), chat: options.chat ?? PRIVATE, from: BOT, text: "Your status", reply_markup: keyboard };
  return { id: `q_${data}`, from: options.from ?? MEMBER, data, message };
}

describe("standingOf", () => {
  it("reads getChatMember: banned, muted, limited, and a restriction that has ended", () => {
    expect(standingOf(banned(MEMBER), NOW)).toBe("removed");
    expect(standingOf(muted(MEMBER), NOW)).toBe("muted");
    expect(standingOf({ ...muted(MEMBER), can_send_messages: true }, NOW)).toBe("restricted");
    expect(standingOf({ ...muted(MEMBER), until_date: seconds(NOW - 1000) }, NOW)).toBe("none");
    expect(standingOf({ status: "left", user: MEMBER }, NOW)).toBe("none");
    expect(standingOf(null, NOW)).toBeNull();
  });
});

describe("/start appeal", () => {
  it("shows the member's standing in each group, from getChatMember, with a button for each", async () => {
    const s = setup({ chats: [GROUP_ID, SECOND_GROUP], member: (chat, user) => (chat === GROUP_ID ? muted({ id: user }) : banned({ id: user })) });
    await s.appeals.onStart(start());
    const [[chat, html, options]] = callsOf(s.out.log, "send") as [[number, string, { keyboard: InlineKeyboard }]];
    expect(chat).toBe(MEMBER.id);
    expect(html).toBe("Your status in the community:\n\n<b>tonkfun·fun community</b>: you can't post for now.\n\n<b>tonkfun·fun Español</b>: you were removed.");
    expect(options.keyboard.inline_keyboard).toEqual([
      [{ text: "Ask a person to review · tonkfun·fun community", callback_data: `ap:${GROUP_ID}` }],
      [{ text: "Ask a person to review · tonkfun·fun Español", callback_data: `ap:${SECOND_GROUP}` }],
    ]);
    expect(callsOf(s.out.log, "member")).toEqual([[GROUP_ID, MEMBER.id], [SECOND_GROUP, MEMBER.id]]);
  });

  it("shows the reason recorded, and nothing restricted for a member in good standing", async () => {
    const s = setup();
    s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "unknown_link", false);
    await s.appeals.onStart(start());
    const [[, html, options]] = callsOf(s.out.log, "send") as [[number, string, { keyboard: InlineKeyboard }]];
    expect(html).toBe("Your status in the community:\n\n<b>tonkfun·fun community</b>: nothing is restricted.\nReason: Reason: unknown_link.");
    expect(options.keyboard.inline_keyboard).toEqual([[{ text: "Ask a person to review", callback_data: `ap:${GROUP_ID}` }]]);
  });

  it("names the group alone when Telegram can't say", async () => {
    const s = setup({ member: () => null });
    await s.appeals.onStart(start());
    expect(callsOf(s.out.log, "send")[0][1]).toBe("Your status in the community:\n\n<b>tonkfun·fun community</b>");
  });
});

describe("asking for a review", () => {
  it("sends one alert with the member's ID, name, username, the reason and the fitting Undo", async () => {
    const s = setup({ member: (_chat, user) => muted({ id: user }) });
    s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "flood", true);
    const member: TgUser = { ...MEMBER, last_name: "Lee", username: "sam_lee" };
    const q = press(`ap:${GROUP_ID}`, { from: member });
    expect(await s.appeals.onPress(q)).toBe(true);
    expect(s.alerts).toEqual([{
      chat: GROUP_ID,
      kind: "appeal",
      category: "flood",
      member: { id: MEMBER.id, name: "Sam Lee", username: "sam_lee", since: null },
      standing: "muted",
      excerpt: null,
      link: null,
      done: null,
      aiGuess: null,
      undo: "mute",
      messageId: null,
      routine: false,
      urgent: false,
    }]);
    expect(callsOf(s.out.log, "answerPress")).toEqual([[q.id, "Sent. A person will review it."]]);
    expect(s.records.appealAt(GROUP_ID, MEMBER.id)).toBe(NOW);
    expect(s.records.counts(GROUP_ID, NOW).appeals).toBe(1);
  });

  it("offers Unban for a ban, the warning's Undo for a warning, Unmute for a mute, with the standing it read, and nothing for nothing", async () => {
    const reviewOf = async (member: TgChatMember | null, offence: boolean) => {
      const s = setup({ member: () => member });
      if (offence) s.records.addOffence(GROUP_ID, MEMBER.id, NOW, "invite_link", false);
      await s.appeals.onPress(press(`ap:${GROUP_ID}`));
      return s.alerts.map((a) => [a.undo, a.standing]);
    };
    expect(await reviewOf(banned(MEMBER), true)).toEqual([["ban", "removed"]]);
    expect(await reviewOf({ status: "member", user: MEMBER }, true)).toEqual([["warn", "none"]]);
    expect(await reviewOf(muted(MEMBER), false)).toEqual([["mute", "muted"]]);
    // A new member's text-only days are no sanction: nothing to review alone, and never an Unmute.
    expect(await reviewOf({ ...muted(MEMBER), can_send_messages: true }, false)).toEqual([]);
    expect(await reviewOf({ ...muted(MEMBER), can_send_messages: true }, true)).toEqual([["warn", "restricted"]]);
    // Telegram couldn't say: no standing, and the Undo follows the record alone.
    expect(await reviewOf(null, true)).toEqual([["warn", null]]);
    // Nothing restricted and nothing on record: nothing to review, so no alert.
    expect(await reviewOf({ status: "member", user: MEMBER }, false)).toEqual([]);
  });

  it("shows the admins the member's current restriction under their name", async () => {
    const out = recordOut({ member: async () => muted(MEMBER) });
    const alerts = createAlerts({ out, records: memoryRecords(), adminChat: ADMIN_CHAT_ID, words: testWords, now: () => NOW, groupTitle: () => "Community" });
    const appeals = createAppeals({ out, records: memoryRecords(), limits: countingLimits(), alerts, chats: [GROUP_ID], groupTitle: () => "Community", words: () => testWords, now: () => NOW });
    await appeals.onPress(press(`ap:${GROUP_ID}`));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const html = callsOf(out.log, "send").find((args) => args[0] === ADMIN_CHAT_ID)?.[1] as string;
    expect(html.split("\n").slice(0, 3)).toEqual(["<b>Alert: appeal</b> · Community", "Member: Sam · <code>101</code>", "Muted"]);
  });

  it("refuses a second request the same day, and takes one the next day", async () => {
    const s = setup({ member: (_chat, user) => banned({ id: user }) });
    await s.appeals.onPress(press(`ap:${GROUP_ID}`));
    const again = press(`ap:${GROUP_ID}`);
    await s.appeals.onPress(again);
    expect(s.alerts).toHaveLength(1);
    expect(callsOf(s.out.log, "answerPress").at(-1)).toEqual([again.id, "One review per group per day."]);
    s.later(DAY);
    await s.appeals.onPress(press(`ap:${GROUP_ID}`));
    expect(s.alerts).toHaveLength(2);
  });

  it("ignores forged presses, presses from anyone else or elsewhere, and groups not allow-listed", async () => {
    const s = setup();
    const presses = [
      { ...press(`ap:${GROUP_ID}`), data: `ap:${SECOND_GROUP}` },
      press(`ap:${GROUP_ID}`, { from: { id: 999, first_name: "Someone else" } }),
      press(`ap:${GROUP_ID}`, { chat: GROUP }),
      press(`ap:${SECOND_GROUP}`),
      press("ap:abc"),
      { id: "inline", from: MEMBER, data: `ap:${GROUP_ID}`, inline_message_id: "AAQ" },
    ];
    for (const q of presses) expect(await s.appeals.onPress(q)).toBe(true);
    expect(s.alerts).toEqual([]);
    // Each is answered silently, so its spinner stops, and nothing else is called.
    expect(s.out.log.map((c) => [c.op, ...c.args])).toEqual(presses.map((q) => ["answerPress", q.id, undefined]));
    expect(s.records.appealAt(GROUP_ID, MEMBER.id)).toBeNull();
    expect(await s.appeals.onPress(press("x:h:0:0"))).toBe(false);
  });
});
