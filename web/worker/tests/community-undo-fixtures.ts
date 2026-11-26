import { vi } from "vitest";
import type { AiLimits } from "../src/telegram/claude/types";
import type { RaidControl } from "../src/telegram/community/types";
import { createUndo } from "../src/telegram/community/undo";
import type { Button, InlineKeyboard, TgCallbackQuery, TgChat, TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, actionsOf, adminInfo, BOT, fakeAdmins, GROUP_ID, memoryRecords, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/** The alert buttons' test bench (community-undo*.test.ts): admins with each right, an alert in the admin chat, a clock the test moves. */

export const ADMIN: TgUser = { id: 500, first_name: "Alex", last_name: "Admin" };
export const TITLE_ONLY: TgUser = { id: 501, first_name: "Tia" };
export const DELETE_ONLY: TgUser = { id: 502, first_name: "Dee" };
export const ANONYMOUS: TgUser = { id: 503, first_name: "Ann" };
export const STRANGER: TgUser = { id: 504, first_name: "Sly" };
export const ADMIN_CHAT: TgChat = { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team" };
export const ALERT_ID = 77;
export const MEMBER_ID = 101;
export const TEXT = "Alert: action · Case: flood\nMember: Sam · sam · 101\n\nReply in the group. Never DM first.";
/** TEXT as the alerts drew it, rebuilt from its entities. */
export const TEXT_HTML = "<b>Alert: action</b> · Case: flood\nMember: Sam · <code>sam</code> · <code>101</code>\n\nReply in the group. Never DM first.";
export const LINK = "https://t.me/c/1234567890/42";

/** x:<action>:<chat>:<target>. */
export const x = (action: string, target: number | string = MEMBER_ID, chat: number = GROUP_ID) => `x:${action}:${chat}:${target}`;

/** An alert's keyboard as alerts-buttons.ts draws it: Open message, then each button's data, two to a row. */
export function alertMarkup(...data: string[]): InlineKeyboard {
  const buttons: Button[] = data.map((d) => ({ text: d.split(":")[1] ?? d, callback_data: d }));
  const rows: Button[][] = [[{ text: "Open message", url: LINK }]];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return { inline_keyboard: rows };
}

/** A press on an alert in the admin chat that really holds a button with this data, unless `markup` says otherwise. */
export function press(data: string, options: { from?: TgUser; chat?: TgChat; markup?: InlineKeyboard; id?: string } = {}): TgCallbackQuery {
  const code = (word: string) => ({ type: "code", offset: TEXT.indexOf(word), length: word.length });
  return {
    id: options.id ?? "press-1",
    from: options.from ?? ADMIN,
    data,
    message: {
      message_id: ALERT_ID,
      date: Math.floor(NOW / 1000),
      chat: options.chat ?? ADMIN_CHAT,
      from: BOT,
      text: TEXT,
      entities: [{ type: "bold", offset: 0, length: "Alert: action".length }, code("sam"), code("101"), { type: "mention", offset: 0, length: 5 }],
      reply_markup: options.markup ?? { inline_keyboard: [[{ text: "Button", callback_data: data }]] },
    },
  };
}

export function setup(options: { press?: boolean; raid?: boolean; name?: string | null | Error; out?: Parameters<typeof recordOut>[0] } = {}) {
  let clock = NOW;
  const out = recordOut(options.out);
  const records = memoryRecords();
  const admins = fakeAdmins({
    [GROUP_ID]: [
      adminInfo(ADMIN.id),
      adminInfo(TITLE_ONLY.id, { canDelete: false, canRestrict: false }),
      adminInfo(DELETE_ONLY.id, { canRestrict: false }),
      adminInfo(ANONYMOUS.id, { anonymous: true }),
    ],
  });
  const limits: AiLimits = {
    answer: () => "ok",
    proactive: () => true,
    triage: () => true,
    report: () => true,
    press: vi.fn(() => options.press ?? true),
    coolDown: () => false,
    busyReply: () => true,
    prune: () => undefined,
  };
  const raid: RaidControl = { active: () => options.raid ?? true, start: vi.fn(), end: vi.fn() };
  const nameOf = vi.fn(async (): Promise<string | null> => {
    if (options.name instanceof Error) throw options.name;
    return options.name === undefined ? "Sam Smith" : options.name;
  });
  const undo = createUndo({ out, records, admins, limits, raid, adminChat: ADMIN_CHAT_ID, chats: [GROUP_ID], words: testWords, nameOf, now: () => clock });
  const calls = () => actionsOf(out.log).map((c) => [c.op, ...c.args]);
  return { undo, out, records, limits, raid, calls, later: (ms: number) => void (clock += ms) };
}
