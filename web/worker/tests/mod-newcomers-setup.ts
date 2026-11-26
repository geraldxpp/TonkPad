import { createAiLimits } from "../src/telegram/claude/limits";
import type { CommunityOut } from "../src/telegram/community/out";
import type { AdminAlert, Admins, Strictness, UserId } from "../src/telegram/community/types";
import { createNewcomers, type NameRiskInput } from "../src/telegram/mod/newcomers";
import type { InlineKeyboard, TgCallbackQuery, TgUser } from "../src/telegram/types";
import { adminInfo, BOT, BOT_ID, fakeAdmins, GROUP, GROUP_ID, memoryRecords, OWNER_ID, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** The new-member check's test bench: a fake clock, the recorder, in-memory records and placeholder words. */

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const DAY = 24 * 60 * MINUTE;
export const SITE = "https://www.tonkfun.fun";
export const unix = (ms: number) => Math.floor(ms / SECOND);
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
export const person = (id: number, extra: Partial<TgUser> = {}): TgUser => ({ id, is_bot: false, first_name: `Newcomer ${id}`, language_code: "en", ...extra });

/** A press on the check message `messageId`, which really holds a button with this data. */
export const press = (from: TgUser, data: string, messageId: number): TgCallbackQuery => ({
  id: `q${from.id}:${data}`, from, data, message: { message_id: messageId, date: unix(NOW), chat: GROUP, from: BOT, text: "check", reply_markup: { inline_keyboard: [[{ text: "x", callback_data: data }]] } },
});

export const keyboardOf = (call: unknown[]) => (call[2] as { keyboard: InlineKeyboard }).keyboard.inline_keyboard;

export interface Options {
  strictness?: Strictness;
  raid?: boolean;
  out?: Partial<CommunityOut>;
  /** Names pass unless a test says otherwise; `undefined` given explicitly uses mod/names.ts. */
  nameRisk?: (input: NameRiskInput) => "link" | "impersonation" | null;
  /** The per-person press limit: claude/limits.ts's (8 in 10 seconds) unless given. */
  press?: (user: UserId, now: number) => boolean;
  /** The group's admins: the owner only unless given. */
  admins?: Admins;
}

export function setup(options: Options = {}, records = memoryRecords({ strictness: options.strictness ?? "normal" })) {
  let now = NOW;
  const out = recordOut(options.out);
  const alerts: AdminAlert[] = [];
  const joins: number[] = [];
  const limits = createAiLimits();
  const newcomers = createNewcomers({
    out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: () => [], bot: () => "TonkfunBot", botId: () => BOT_ID, now: () => now, site: SITE,
    admins: options.admins ?? fakeAdmins({ [GROUP_ID]: [adminInfo(OWNER_ID)] }), allowedBots: ["goodhelperbot"], groupLang: "en", nameRisk: "nameRisk" in options ? options.nameRisk : () => null,
    raid: { active: () => options.raid === true, start: () => undefined, end: () => undefined, noteJoin: (_chat, at) => void joins.push(at) },
    settings: (chat) => records.settings(chat),
    press: options.press ?? ((user, at) => limits.press(user, at)),
  });
  const at = (t: number) => {
    now = t;
    return t;
  };
  /** The joined message, after each joiner's chat_member update said they hold no restriction (the usual order). */
  const join = (users: TgUser[], joinMessageId: number, t: number, adder: TgUser | null = users[0]) => {
    for (const u of users) newcomers.noteHeld(GROUP_ID, u.id, { status: "member", user: u }, t);
    return newcomers.onJoin(GROUP_ID, users, adder, joinMessageId, unix(t), at(t));
  };
  /** The joined message before any chat_member update: the join waits up to a second for them (use fake timers). */
  const joinFirst = (users: TgUser[], joinMessageId: number, t: number) => newcomers.onJoin(GROUP_ID, users, users[0], joinMessageId, unix(t), at(t));
  return { out, records, alerts, joins, newcomers, at, join, joinFirst };
}
