import type { AiLimits, Budget } from "../src/telegram/claude/types";
import { createControls } from "../src/telegram/community/controls";
import type { CommunityOut } from "../src/telegram/community/out";
import type { AdminAlert, AlertSink, RaidControl, Records } from "../src/telegram/community/types";
import type { InlineKeyboard, TgCallbackQuery, TgChat, TgMessage, TgUser } from "../src/telegram/types";
import { ADMIN_CHAT_ID, adminInfo, BOT, callsOf, fakeAdmins, GROUP_ID, groupMessage, memoryRecords, openBudget, OWNER_ID, recordOut, testWords } from "./community-fixtures";
import { NOW } from "./fixtures";

/**
 * The admin controls' test bench: a group with an owner, an admin with Ban
 * users and an admin with only a title, a recording CommunityOut, in-memory
 * records, an open budget, a raid switch and counting press limits.
 */

export const OWNER: TgUser = { id: OWNER_ID, is_bot: false, first_name: "Olive", last_name: "Owner", username: "olive_owner" };
export const BANNER: TgUser = { id: 201, is_bot: false, first_name: "Bea", username: "bea_bans" };
export const TITLED: TgUser = { id: 202, is_bot: false, first_name: "Tim" };
export const ANONYMOUS: TgUser = { id: 1_087_968_824, is_bot: true, first_name: "Group", username: "GroupAnonymousBot" };
export const ADMIN_CHAT: TgChat = { id: ADMIN_CHAT_ID, type: "supergroup", title: "Team" };
export const HOURS_47 = 47 * 60 * 60 * 1000;

/** Press limits that count, with no window: past `max`, a person is refused. */
function countingLimits(max: number): AiLimits {
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

function fakeRaid(): RaidControl & { log: string[] } {
  const on = new Set<number>();
  const log: string[] = [];
  return {
    log,
    active: (chat) => on.has(chat),
    start: (chat, reason) => void (on.add(chat), log.push(`start:${reason}`)),
    end: (chat) => void (on.delete(chat), log.push("end")),
  };
}

export interface ControlsOptions {
  budget?: Budget;
  pressMax?: number;
  out?: Partial<CommunityOut>;
  /** The alerts to use instead of a recorder (the real ones, say). */
  alerts?: (out: CommunityOut, records: Records) => AlertSink;
}

export function controlsBench(options: ControlsOptions = {}) {
  const out = recordOut(options.out);
  const records = memoryRecords();
  const admins = fakeAdmins(
    { [GROUP_ID]: [adminInfo(OWNER_ID, { name: "Olive Owner" }), adminInfo(BANNER.id, { name: "Bea", canDelete: false }), adminInfo(TITLED.id, { name: "Tim", canDelete: false, canRestrict: false })] },
    [OWNER_ID],
  );
  const alerts: AdminAlert[] = [];
  const raid = fakeRaid();
  const budget = options.budget ?? openBudget();
  const controls = createControls({
    out, records, admins, budget, raid,
    limits: countingLimits(options.pressMax ?? 8),
    alerts: options.alerts?.(out, records) ?? { alert: (a) => void alerts.push(a) },
    adminChat: ADMIN_CHAT_ID,
    chats: [GROUP_ID],
    words: () => testWords,
    adminWords: testWords,
    status: (chat) => ({ text: `Status of ${chat}` }),
    now: () => NOW,
  });
  return { out, records, alerts, raid, budget, controls };
}

export type Bench = ReturnType<typeof controlsBench>;

/** A command as the pipeline hands it over: its name and what follows it. */
export function command(s: Bench, m: TgMessage): Promise<boolean> {
  const [head, ...rest] = (m.text ?? "").slice(1).split(" ");
  return s.controls.onCommand(m, { name: head, arg: rest.join(" ") });
}

export const inGroup = (text: string, from: TgUser, extra: Partial<TgMessage> = {}) => groupMessage(text, { from, ...extra });
export const inAdminChat = (text: string, from: TgUser) => groupMessage(text, { from, chat: ADMIN_CHAT });
export const replyTo = (author: TgUser, text = "hello") => groupMessage(text, { from: author });

/** A press on a message in the admin chat (or `chat`) that holds exactly these buttons. */
export function adminPress(data: string, from: TgUser, buttons: string[] = [data], chat: TgChat = ADMIN_CHAT): TgCallbackQuery {
  const keyboard: InlineKeyboard = { inline_keyboard: [buttons.map((d) => ({ text: d, callback_data: d }))] };
  const message: TgMessage = { message_id: 900, date: Math.floor(NOW / 1000), chat, from: BOT, text: "Panel", reply_markup: keyboard };
  return { id: `press_${data}`, from, data, message };
}

/** Every message ID removed, in order. */
export const removed = (s: Bench) => callsOf(s.out.log, "remove").flatMap((args) => args[1] as number[]);
/** Every send to the admin chat: [chat, html, options]. */
export const adminSends = (s: Bench) => callsOf(s.out.log, "send").filter((args) => args[0] === ADMIN_CHAT_ID);
