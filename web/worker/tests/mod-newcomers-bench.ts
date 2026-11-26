import type { BotApi } from "../src/telegram/api";
import { createAiLimits } from "../src/telegram/claude/limits";
import { createMembers } from "../src/telegram/community/members";
import { createRecords } from "../src/telegram/community/records";
import { emptyCommunityState } from "../src/telegram/community/state";
import { createTelegramOut } from "../src/telegram/community/telegram-out";
import type { AdminAlert, ChatSettings, Strictness } from "../src/telegram/community/types";
import { createNewcomers } from "../src/telegram/mod/newcomers";
import { Sender } from "../src/telegram/sender";
import type { TgCallbackQuery, TgChatMember } from "../src/telegram/types";
import { adminInfo, BOT, BOT_ID, fakeAdmins, GROUP, GROUP_ID, OWNER_ID, testWords } from "./community-fixtures";
import { fakeTelegram } from "./mod-newcomers-telegram";
import { person, unix } from "./mod-newcomers-setup";

/**
 * The new-member check as it runs in production, for join bursts: the real
 * records, telegram-out, Sender and members.ts over a Bot API that answers
 * each call after `latencyMs` and keeps each member's restriction
 * (mod-newcomers-telegram.ts), and the hooks' timers (a 5-second tick behind
 * its guard, deletes first, and the minute's records prune). Everything runs
 * on the fake clock (vi.useFakeTimers before calling it); nothing touches
 * the network.
 */

export type { ApiCall } from "./mod-newcomers-telegram";

export interface Joined {
  user: number;
  at: number;
}

/** Which report of a join Telegram hands over first, and how long after it the other comes (never: the update is lost). */
export type Order = "message" | "update";

export interface BenchOptions {
  strictness?: Strictness;
  raid?: boolean;
  latencyMs?: number;
}

export function burstBench(options: BenchOptions = {}) {
  const tg = fakeTelegram(options.latencyMs ?? 100);
  const api: BotApi = tg.api;
  const lines: string[] = [];
  const log = (line: string) => void lines.push(line);
  const sender = new Sender(api, log, () => Date.now());
  const settings: ChatSettings = { paused: false, proactive: true, strictness: options.strictness ?? "normal", raidUntil: 0 };
  const records = createRecords(emptyCommunityState(), { persist: () => undefined, defaults: () => ({ ...settings }), now: () => Date.now() });
  const out = createTelegramOut({ sender, records, adminChat: null, log, now: () => Date.now() });
  const limits = createAiLimits();
  const alerts: AdminAlert[] = [];
  const admins = fakeAdmins({ [GROUP_ID]: [adminInfo(OWNER_ID)] });
  const newcomers = createNewcomers({
    out, records, words: () => testWords, alerts: { alert: (a) => void alerts.push(a) }, recentIds: () => [], bot: () => BOT.username ?? null, now: () => Date.now(), log,
    admins, allowedBots: [], groupLang: "en", nameRisk: () => null,
    raid: { active: () => options.raid === true, start: () => undefined, end: () => undefined },
    settings: (chat) => records.settings(chat),
    press: (user, now) => limits.press(user, now),
  });
  const members = createMembers({
    owns: (chat) => chat === GROUP_ID, records, newcomers, admins, alerts: { alert: (a) => void alerts.push(a) }, botId: () => BOT_ID, owners: [OWNER_ID],
    words: testWords, log, now: () => Date.now(), out,
  });

  // The hooks' timers, as community/index-hooks.ts runs them.
  let ticking = false;
  let longestTickMs = 0;
  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    const at = Date.now();
    try {
      await out.tick(at);
      await newcomers.tick(at);
    } finally {
      longestTickMs = Math.max(longestTickMs, Date.now() - at);
      ticking = false;
    }
  }
  const timers = [setInterval(() => void tick(), 5_000), setInterval(() => records.prune(Date.now()), 60_000)];

  const joined: Joined[] = [];
  const pressed: Array<{ user: number; at: number }> = [];
  const pressOf = (user: number, messageId: number, data: string, id: string): TgCallbackQuery => ({
    id, from: person(user), data,
    message: { message_id: messageId, date: unix(Date.now()), chat: GROUP, from: BOT, text: "check", reply_markup: { inline_keyboard: [[{ text: "x", callback_data: data }]] } },
  });
  /** The chat_member update for a join, as Telegram writes it: the member as they were when they joined. */
  const update = (user: number, as: TgChatMember) => {
    void members.onMember({ chat: GROUP, from: person(user), date: unix(Date.now()), old_chat_member: { status: "left", user: person(user) }, new_chat_member: as });
  };
  const message = (user: number) => void members.onServiceJoin({ message_id: 10_000 + user, date: unix(Date.now()), chat: GROUP, from: person(user), new_chat_members: [person(user)] });

  return {
    calls: tg.calls,
    tg,
    out,
    records,
    alerts,
    lines,
    sender,
    newcomers,
    members,
    joined,
    pressed,
    longestTick: () => longestTickMs,
    of: (method: string) => tg.calls.filter((c) => c.method === method),
    /** `user` joins `afterMs` from now, alone, with the joined message 10 000 + user, straight to the check (no update); the handler isn't awaited, as the poller doesn't. */
    joinAt(afterMs: number, user: number): void {
      setTimeout(() => {
        const at = Date.now();
        joined.push({ user, at });
        tg.join(user);
        void newcomers.onJoin(GROUP_ID, [person(user)], person(user), 10_000 + user, unix(at), at);
      }, afterMs);
    },
    /** `user` joins `afterMs` from now, reported by members.ts twice: `first` at once, the other `gapMs` later (or never, for null). */
    joinBoth(afterMs: number, user: number, first: Order, gapMs: number | null): void {
      setTimeout(() => {
        joined.push({ user, at: Date.now() });
        tg.join(user);
        const as = tg.memberAt(user);
        const [one, two] = first === "message" ? [() => message(user), () => update(user, as)] : [() => update(user, as), () => message(user)];
        one();
        if (gapMs !== null) setTimeout(two, gapMs);
      }, afterMs);
    },
    /** `user` taps their check's button `afterMs` from now: `data`, or the right one (h:0, or the hard check's number). */
    pressAt(afterMs: number, user: number, data?: string): void {
      setTimeout(() => {
        const at = Date.now();
        pressed.push({ user, at });
        const p = records.pending(GROUP_ID, user);
        const messageId = p?.messageId ?? 1;
        void newcomers.onPress(pressOf(user, messageId, data ?? `h:${p?.target ?? 0}`, `q${user}:${messageId}`), at);
      }, afterMs);
    },
    /** Someone taps the newest check message they can see (they need not be on it) `afterMs` from now; `n` numbers their taps. */
    tapAt(afterMs: number, user: number, n: number): void {
      setTimeout(() => {
        pressed.push({ user, at: Date.now() });
        void newcomers.onPress(pressOf(user, tg.lastCheck() ?? 1, "h:0", `f${user}:${n}`), Date.now());
      }, afterMs);
    },
    stop: () => timers.forEach(clearInterval),
  };
}

/** A removal (unbanChatMember without only_if_banned), not an unban. */
export const isKick = (c: { method: string; params: Record<string, unknown> }) => c.method === "unbanChatMember" && c.params.only_if_banned === undefined;
/** A restriction that leaves no sending at all (the check's), or text only (passed). */
export const isMute = (c: { method: string; params: Record<string, unknown> }) =>
  c.method === "restrictChatMember" && (c.params.permissions as { can_send_messages?: boolean }).can_send_messages === false;
export const isTextOnly = (c: { method: string; params: Record<string, unknown> }) =>
  c.method === "restrictChatMember" && (c.params.permissions as { can_send_messages?: boolean; can_send_photos?: boolean }).can_send_messages === true
  && (c.params.permissions as { can_send_photos?: boolean }).can_send_photos === false;
