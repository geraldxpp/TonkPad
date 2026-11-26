import type { Locale } from "@/shared/i18n/config";
import type { AiLimits } from "../claude/types";
import { botLocale } from "../i18n";
import { pressMatches } from "../press";
import { escapeHtml, fill, plainText } from "../text";
import type { Button, TgCallbackQuery, TgChatMember, TgMessage } from "../types";
import { alertMember, fillText, groupHtml } from "./controls-people";
import { type PressReply, pressLimit, pressReply } from "./controls-press";
import type { CommunityOut } from "./out";
import type { AdminAlert, AlertSink, ChatId, Records } from "./types";
import type { CommunityDictionary } from "./words";

export interface AppealDeps {
  out: CommunityOut;
  records: Records;
  alerts: AlertSink;
  /** The allow-listed community groups. */
  chats: readonly ChatId[];
  groupTitle: (chat: ChatId) => string;
  words: (lang: Locale) => CommunityDictionary;
  limits: AiLimits;
  now: () => number;
}

/** One review request per member per group per day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a member stands in a group, as the review shows it (and its alert, admin.standing). */
export type Standing = NonNullable<AdminAlert["standing"]>;

/**
 * A member's standing from getChatMember: banned is "removed", a
 * restriction without messages "muted", any other restriction (a new
 * member's text-only days) "restricted"; one whose end has passed, and
 * everyone else (members, admins, those who left), "none". Null when
 * Telegram couldn't say.
 */
export function standingOf(member: TgChatMember | null, now: number): Standing | null {
  if (!member) return null;
  const until = typeof member.until_date === "number" ? member.until_date : 0;
  if (until > 0 && until * 1000 <= now) return "none";
  if (member.status === "kicked") return "removed";
  if (member.status === "restricted") return member.can_send_messages === false ? "muted" : "restricted";
  return "none";
}

/**
 * The Undo button a review alert offers: Unban, Unmute, or removing the
 * last warning. A new member's text-only days are no sanction, so they never
 * offer Unmute, which would lift a newcomer's limits.
 */
function undoFor(standing: Standing | null, offences: number): AdminAlert["undo"] {
  if (standing === "removed") return "ban";
  if (standing === "muted") return "mute";
  return offences > 0 ? "warn" : null;
}

/**
 * Something a person could review: a mute (no messages at all) or a ban
 * that getChatMember shows, or an offence on record. A text-only
 * restriction alone is a new member's first days, the same for everyone
 * new: nothing to review, so no alert.
 */
const reviewable = (standing: Standing | null, offences: number) => offences > 0 || standing === "muted" || standing === "removed";

/**
 * Reviews (prompts/15-community-agent.md, Asking for a review). The
 * "Why? Ask for a review" button on a notice opens a private chat at
 * /start appeal: for each community group, the member's standing there and
 * the reason recorded, with "Ask a person to review". A press sends the
 * admins one alert with the member's ID, name and username, the reason,
 * their current restriction and the Undo button that fits it; once per
 * member per group per day, only from the member themselves in that
 * private chat, and only when there is something to review there (a mute
 * or ban getChatMember shows, or an offence on record; a new member's
 * text-only days are none). Anyone else is told where they stand, and
 * nothing is kept or sent. Every press gets one answer, silent when it goes
 * no further.
 */
export function createAppeals(deps: AppealDeps): { onStart(m: TgMessage): Promise<void>; onPress(q: TgCallbackQuery): Promise<boolean> } {
  const { out, records, alerts, chats, groupTitle, words, limits } = deps;
  const withinLimit = pressLimit(limits);
  /** Requests waiting on getChatMember (`<group>:<member>`, for seconds), so two quick presses send one alert. */
  const asking = new Set<string>();

  async function start(m: TgMessage): Promise<void> {
    const from = m.from;
    if (!from || from.is_bot === true || m.chat.type !== "private") return;
    const now = deps.now();
    const w = words(botLocale(from.language_code));
    const lines = [escapeHtml(w.appeal.intro)];
    const rows: Button[][] = [];
    for (const chat of chats) {
      const title = groupTitle(chat);
      const group = `<b>${groupHtml(chat, title)}</b>`;
      const standing = standingOf(await out.member(chat, from.id), now);
      lines.push("", standing ? fill(w.appeal[standing], { group }) : group);
      const reason = records.offences(chat, from.id, now).category;
      if (reason) lines.push(fill(w.appeal.reason, { reason: escapeHtml(w.mod.reasons[reason]) }));
      // With more than one group, each button names its own.
      const label = chats.length > 1 ? `${w.appeal.ask} · ${plainText(title, 24) || chat}` : w.appeal.ask;
      rows.push([{ text: label, callback_data: `ap:${chat}` }]);
    }
    await out.send(m.chat.id, lines.join("\n"), { kind: "answer", keyboard: rows.length > 0 ? { inline_keyboard: rows } : undefined });
  }

  /** A review request: only from the review view in the member's own private chat, for an allow-listed group. */
  async function press(q: TgCallbackQuery, reply: PressReply): Promise<void> {
    const m = q.message;
    const chat = Number((q.data ?? "").slice(3));
    if (!m || m.chat.type !== "private" || m.chat.id !== q.from.id || !pressMatches(q) || !chats.includes(chat)) return reply.say();
    const now = deps.now();
    if (!(await withinLimit(q, reply, now))) return;
    const w = words(botLocale(q.from.language_code));
    const key = `${chat}:${q.from.id}`;
    if (asking.has(key)) return reply.say();
    const last = records.appealAt(chat, q.from.id);
    if (last !== null && now - last < DAY_MS) return reply.say(w.appeal.once);
    asking.add(key);
    try {
      const standing = standingOf(await out.member(chat, q.from.id), now);
      const offences = records.offences(chat, q.from.id, now);
      if (!reviewable(standing, offences.n)) {
        // Nothing to review, or Telegram couldn't say: nothing is kept or sent, and a toast says why (a new member's text-only days included).
        const group = plainText(groupTitle(chat), 64) || String(chat);
        return reply.say(standing === null ? w.check.retry : fillText(standing === "restricted" ? w.appeal.restricted : w.appeal.none, { group }));
      }
      records.markAppeal(chat, q.from.id, now);
      records.count(chat, "appeals", now);
      alerts.alert({
        chat,
        kind: "appeal",
        category: offences.category,
        member: alertMember(q.from),
        standing,
        excerpt: null,
        link: null,
        done: null,
        aiGuess: null,
        undo: undoFor(standing, offences.n),
        messageId: null,
        routine: false,
        urgent: false,
      });
      await reply.say(w.appeal.sent);
    } finally {
      asking.delete(key);
    }
  }

  return {
    async onStart(m) {
      try {
        await start(m);
      } catch {
        // Never into the update loop: the member can open the link again.
      }
    },

    async onPress(q) {
      if (typeof q.data !== "string" || !q.data.startsWith("ap:")) return false;
      const reply = pressReply(out, q);
      try {
        await press(q, reply);
      } catch {
        // As above: the press is the review's, whatever happens to it, and its spinner stops.
        await reply.say().catch(() => undefined);
      }
      return true;
    },
  };
}
