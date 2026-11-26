import { escapeHtml, safeText } from "../text";
import type { TgChat, TgMessage, TgUser } from "../types";
import type { AdminAlert, ChatId } from "./types";

/**
 * Who a command or a report is about, and how the admin chat shows people.
 * Shared by the admin controls, /report and review requests.
 */

/** Routine notes in the admin chat (panels, lists, refusals) are deleted after 47 hours, the last moment a bot can. */
export const ROUTINE_MS = 47 * 60 * 60 * 1000;

/**
 * The name Telegram shows for someone: first and last name, as admins.ts
 * builds it. The trusted-name fingerprint is taken of this, so whatever
 * checks it must build the name the same way.
 */
export function fullName(user: TgUser): string {
  return [user.first_name, user.last_name].filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}

/** Someone in an alert's plain text ("Sam Lee (sam_lee)"); alerts.ts cleans and escapes it. */
export function personText(user: TgUser): string {
  const name = fullName(user) || String(user.id);
  return user.username ? `${name} (${user.username})` : name;
}

/** Someone in the bot's own HTML for the admin chat: the cleaned name, then the username as code (no @, so no tap-to-DM link); "" with neither. */
export function personHtml(user: TgUser): string {
  const name = safeText(fullName(user), 64);
  const username = user.username ? `(<code>${escapeHtml(user.username)}</code>)` : "";
  return [name, username].filter((part) => part !== "").join(" ");
}

/** A person for an alert, as Telegram gave them (alerts.ts cleans them); without the ID, an alert is never held back as a repeat. */
export function alertMember(user: TgUser, withId = true): NonNullable<AdminAlert["member"]> {
  return { id: withId ? user.id : null, name: fullName(user), username: user.username ?? null, since: null };
}

/** A group's title for the bot's own HTML, cleaned; its ID as code when it has none. */
export const groupHtml = (chat: ChatId, title: string | undefined): string => safeText(title ?? "", 64) || `<code>${chat}</code>`;

/** A template from the bot's words with {placeholders} filled, as plain text for an alert (alerts.ts escapes it). */
export function fillText(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match));
}

/** The forum topic a message is in, for replies there: only real topics, since other groups reject a thread ID. */
export const topicOf = (m: TgMessage): number | undefined =>
  m.is_topic_message === true && typeof m.message_thread_id === "number" ? m.message_thread_id : undefined;

/**
 * The message a command replies to, or null. In a forum, a message that
 * replies to nothing else still replies to its topic's root, which counts as
 * no reply.
 */
export function repliedTo(m: TgMessage): TgMessage | null {
  const replied = m.reply_to_message;
  if (!replied) return null;
  if (replied.forum_topic_created !== undefined) return null;
  if (m.is_topic_message === true && replied.message_id === m.message_thread_id) return null;
  return replied;
}

/** Who wrote a message: a person, someone posting as a channel, or nobody the bot acts on (a bot, the group itself, the channel's own post). */
export type Author = { kind: "person"; user: TgUser } | { kind: "channel"; chat: TgChat } | null;

export function authorOf(m: TgMessage): Author {
  if (m.is_automatic_forward === true) return null;
  if (m.sender_chat) return m.sender_chat.id === m.chat.id ? null : { kind: "channel", chat: m.sender_chat };
  if (!m.from || m.from.is_bot === true) return null;
  return { kind: "person", user: m.from };
}

/** A positive Telegram user ID typed after a command, or null. */
export function userIdArg(arg: string): number | null {
  const text = arg.trim();
  if (!/^\d{1,16}$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
