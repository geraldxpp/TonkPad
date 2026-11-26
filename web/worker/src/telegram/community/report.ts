import type { Locale } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import type { AiLimits } from "../claude/types";
import { botLocale } from "../i18n";
import { findSecret } from "../mod/secrets";
import { escapeHtml } from "../text";
import type { TgMessage, TgUser } from "../types";
import { messageLink } from "./alerts";
import { alertMember, type Author, authorOf, fullName, repliedTo, topicOf } from "./controls-people";
import type { CommunityOut } from "./out";
import { realAdmin } from "./pipeline-who";
import type { AdminAlert, Admins, AlertSink, Records, UserId } from "./types";
import type { CommunityDictionary } from "./words";

export interface ReportDeps {
  out: CommunityOut;
  admins: Admins;
  limits: AiLimits;
  /** The admin chat's alerts, or null when there is no admin chat. */
  alerts: AlertSink | null;
  words: (lang: Locale) => CommunityDictionary;
  now: () => number;
  /** When given, each report sent to the admins counts toward the group's "reports" for /status. */
  records?: Pick<Records, "count">;
  /** Whether the admin chat passed its setup checks (always, unless given): until then a report gets "Reports aren't set up yet", never thanks. */
  ready?: () => boolean;
}

/** A note to a reporter in the group (how to report, thanks, slow down) stays 30 seconds. */
const NOTE_MS = 30_000;
/** "Slow down" is said once per reporter per 10 minutes, the report limit's window; the ID is forgotten with it. */
const TOLD_MS = 10 * 60_000;
const EXCERPT_CHARS = 300;
const REASON_CHARS = 100;

/** A short excerpt of member text for the admins: never a secret, never empty. */
function excerptOf(text: string): string | null {
  const visible = visibleText(text);
  return visible === "" || findSecret(visible) !== null ? null : clip(visible, EXCERPT_CHARS);
}

/** Who the alert is about: the reported person, or the channel someone posted as (no ID: nobody to mute). */
function reportedMember(author: NonNullable<Author>): NonNullable<AdminAlert["member"]> {
  if (author.kind === "person") return alertMember(author.user);
  return { id: null, name: author.chat.title ?? "", username: author.chat.username ?? null, since: null };
}

/** Who sent the report, for the alert's own line: name, username and ID, as Telegram gave them (alerts.ts cleans them). */
const reporterOf = (from: TgUser): NonNullable<AdminAlert["reporter"]> => ({ id: from.id, name: fullName(from), username: from.username ?? null });

/** The reason the reporter gave, for the alert's own "Reason given" line (never "Done", which is the bot's), or null: never a secret. Plain text: the alerts clean it like an excerpt. */
function reasonText(reason: string): string | null {
  const why = visibleText(reason);
  return why !== "" && findSecret(why) === null ? clip(why, REASON_CHARS) : null;
}

/**
 * /report (prompts/15-community-agent.md, Human attention). In a group it
 * replies to a message: the command is deleted, the admins get the message's
 * excerpt and link, who wrote it and who reported it, and any reason given
 * under its own label (never as what the bot did), with Delete and Mute 1 h
 * (alerts.ts draws them for kind report), and the reporter a thanks that
 * goes after 30 seconds. A /report that replies to nothing gets the group's
 * own usage note (reply to the message), whatever follows it. Nothing acts
 * on its own. Reports on real admins (pipeline-who.ts realAdmin: not one
 * with a title only), bots or oneself are ignored; 3 per person per 10
 * minutes. In a private chat /report <text> is shared by the member's
 * choice: name and username, no ID. Until the admin chat passed its checks,
 * either gets "Reports aren't set up yet" instead of thanks, and nothing is
 * sent.
 */
export function createReports(deps: ReportDeps): { onGroupReport(m: TgMessage, reason: string): Promise<void>; onPrivateReport(m: TgMessage, text: string): Promise<boolean> } {
  const { out, admins, limits, alerts, words } = deps;
  const told = new Set<UserId>();

  /** Whether to say "slow down" now: once per window, then quiet, so the bot can't be made to spam the group. */
  function tell(user: UserId): boolean {
    if (told.has(user)) return false;
    told.add(user);
    // The ID goes after the window whatever else happens: the privacy page promises 10 minutes at most.
    setTimeout(() => told.delete(user), TOLD_MS).unref?.();
    return true;
  }

  async function groupNote(m: TgMessage, text: string, reporter: UserId): Promise<void> {
    // Never a reply to the reported message: a reply would notify its author.
    const id = await out.send(m.chat.id, escapeHtml(text), { kind: "notice", thread: topicOf(m), ephemeralTo: reporter });
    if (id !== null) out.removeLater(m.chat.id, id, NOTE_MS);
  }

  async function groupReport(m: TgMessage, reason: string): Promise<void> {
    const chat = m.chat.id;
    out.remove(chat, [m.message_id]);
    const from = m.from;
    // Anonymous admins and people posting as a channel: no person to thank or to pace.
    if (!alerts || m.sender_chat || !from || from.is_bot === true) return;
    const now = deps.now();
    const w = words(botLocale(from.language_code));
    if (!limits.report(from.id, now)) {
      if (tell(from.id)) await groupNote(m, w.report.slowDown, from.id);
      return;
    }
    const replied = repliedTo(m);
    if (!replied) return groupNote(m, w.report.usage, from.id);
    const author = authorOf(replied);
    // A title-only admin can be reported: such accounts are moderated as trusted members, and get hacked too.
    if (!author || (author.kind === "person" && (author.user.id === from.id || realAdmin(admins, chat, author.user.id)))) return;
    // The admin chat hasn't passed its checks: nobody would see the report, so the reporter is told where to go instead.
    if (deps.ready?.() === false) return groupNote(m, w.report.noAdminChat, from.id);
    alerts.alert({
      chat,
      kind: "report",
      category: "reported",
      member: reportedMember(author),
      reporter: reporterOf(from),
      excerpt: excerptOf(replied.text ?? replied.caption ?? ""),
      link: messageLink(m.chat, replied.message_id, topicOf(m)),
      done: null,
      reason: reasonText(reason),
      aiGuess: null,
      undo: null,
      messageId: replied.message_id,
      routine: false,
      urgent: false,
    });
    deps.records?.count(chat, "reports", now);
    await groupNote(m, w.report.thanks, from.id);
  }

  async function privateReport(m: TgMessage, text: string): Promise<boolean> {
    const from = m.from;
    if (!from || from.is_bot === true || m.chat.type !== "private") return false;
    const body = visibleText(text);
    // Nothing to share: the caller shows how to use it.
    if (body === "") return false;
    const w = words(botLocale(from.language_code));
    const reply = (line: string) => out.send(m.chat.id, escapeHtml(line), { kind: "answer" });
    if (findSecret(body) !== null) {
      // A recovery phrase or key goes nowhere: the message is removed and the member warned.
      out.remove(m.chat.id, [m.message_id]);
      await reply(w.safety.secretPrivate);
      return true;
    }
    if (!alerts || deps.ready?.() === false) {
      await reply(w.report.noAdminChat);
      return true;
    }
    if (!limits.report(from.id, deps.now())) {
      await reply(w.report.slowDown);
      return true;
    }
    alerts.alert({
      chat: null,
      kind: "scam_report",
      category: "scam_report",
      member: alertMember(from, false),
      excerpt: clip(body, EXCERPT_CHARS),
      link: null,
      done: null,
      aiGuess: null,
      undo: null,
      messageId: null,
      routine: false,
      urgent: false,
    });
    await reply(w.report.thanksPrivate);
    return true;
  }

  return {
    async onGroupReport(m, reason) {
      try {
        await groupReport(m, reason);
      } catch {
        // A report must never break the update loop; the member can send it again.
      }
    },

    async onPrivateReport(m, text) {
      try {
        return await privateReport(m, text);
      } catch {
        return true;
      }
    },
  };
}
