import { clip, visibleText } from "../../text";
import type { TgMessage, TgUser } from "../types";

/**
 * What a message carries besides its words: a risky file, link buttons
 * (another bot's, and every button's target for the link rules), a reply to
 * another chat, where a forward came from, and what makes several messages
 * one for the flood limits. Telegram's fields are untrusted, so each is
 * checked before it is read.
 */

/** The bot itself (agent/triggers.ts Me), known by its ID alone: its own inline cards and buttons are never another bot's. */
export type Self = { id: number };

/** At most this many button targets, each at most this long (rules-scan.ts keeps the same bounds). */
const BUTTONS_MAX = 50;
const TARGET_CHARS = 2_048;
/** Telegram's media_group_id is a short string; anything longer isn't one. */
const ALBUM_CHARS = 64;

/** Executables and archives by extension, and by the type a client declares. */
const RISKY_EXTENSIONS = new Set(["apk", "exe", "msi", "bat", "cmd", "scr", "js", "vbs", "jar", "dmg", "pkg", "zip", "rar", "7z", "iso"]);
const RISKY_TYPES = new Set([
  "application/vnd.android.package-archive", "application/x-msdownload", "application/x-msdos-program", "application/vnd.microsoft.portable-executable", "application/x-msi", "application/x-ms-installer",
  "application/x-bat", "application/javascript", "text/javascript", "application/x-javascript", "text/vbscript", "application/java-archive", "application/x-java-archive", "application/x-apple-diskimage",
  "application/vnd.apple.installer+xml", "application/zip", "application/x-zip-compressed", "application/vnd.rar", "application/x-rar-compressed", "application/x-7z-compressed", "application/x-iso9660-image",
]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A document that is an executable or an archive (apk, exe, msi, bat, cmd, scr, js, vbs, jar, dmg, pkg, zip, rar, 7z, iso), by its name's last extension or its type. */
export function riskyFile(m: TgMessage): boolean {
  const doc: unknown = m.document;
  if (typeof doc !== "object" || doc === null) return false;
  const name = visibleText(str((doc as { file_name?: unknown }).file_name)).replace(/[\s.]+$/, "");
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  const type = str((doc as { mime_type?: unknown }).mime_type).split(";")[0].trim().toLowerCase();
  return RISKY_EXTENSIONS.has(extension) || RISKY_TYPES.has(type);
}

/**
 * Whether a user (via_bot, a forward's sender) is the bot: by its ID alone,
 * which Telegram always sends, never a username, which can pass to another
 * account. Never when the bot doesn't know itself yet.
 */
function isSelf(user: unknown, me: Self | null | undefined): boolean {
  if (!me || typeof user !== "object" || user === null) return false;
  const { id } = user as { id?: unknown };
  return typeof id === "number" && id === me.id;
}

/** The buttons of a message's inline keyboard; malformed rows and buttons are skipped. */
function buttonsOf(m: TgMessage): object[] {
  const markup: unknown = m.reply_markup;
  const rows: unknown = typeof markup === "object" && markup !== null ? (markup as { inline_keyboard?: unknown }).inline_keyboard : undefined;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) => (Array.isArray(row) ? row.filter((b: unknown): b is object => typeof b === "object" && b !== null) : []));
}

const linkButton = (button: object) => "url" in button || "login_url" in button || "web_app" in button;
/** A token card's Refresh button (views.ts cardView): its data is r:<lang>:<address>, or the older r:<address>. */
const refreshButton = (button: object) => {
  const data: unknown = (button as { callback_data?: unknown }).callback_data;
  return typeof data === "string" && data.startsWith("r:");
};

/**
 * The bot's own token card as a member posts it through its inline mode
 * (or forwards a message that is one): via the bot, known by its ID alone,
 * with the card's Refresh button. Only the bot writes an inline result's
 * words and buttons, and nobody can edit a message sent via a bot, so
 * nothing in it is the member's own (a token's name is its creator's, as
 * the bot cleaned it). Anything else the bot's inline mode posts is not one.
 */
export function ownCard(m: TgMessage, me?: Self | null): boolean {
  return isSelf(m.via_bot, me) && buttonsOf(m).some(refreshButton);
}

/** Sent through another bot's inline mode with link buttons: a way to post links past the link rules. Never the bot's own inline cards (`me`). */
export function viaButtons(m: TgMessage, me?: Self | null): boolean {
  const via: unknown = m.via_bot;
  if (typeof via !== "object" || via === null || isSelf(via, me)) return false;
  return buttonsOf(m).some(linkButton);
}

/** A link button's target: its url, or its login_url's or web_app's url. */
function targetOf(button: object): string | null {
  const { url, login_url: login, web_app: app } = button as { url?: unknown; login_url?: unknown; web_app?: unknown };
  const inner = (v: unknown): unknown => (typeof v === "object" && v !== null ? (v as { url?: unknown }).url : undefined);
  for (const target of [url, inner(login), inner(app)]) if (typeof target === "string" && target.trim() !== "") return target;
  return null;
}

/**
 * The targets of a message's link buttons (url, login_url and web_app), as
 * given and untrusted, for the link rules (RuleInput.buttons): at most 50,
 * each at most 2,048 characters. Any message's, an inline bot's and a
 * forward's alike, but never the bot's own: its inline cards (via_bot is
 * the bot) and forwards of its messages.
 */
export function buttonLinks(m: TgMessage, me?: Self | null): string[] {
  const origin: unknown = m.forward_origin;
  const forwardedBot = typeof origin === "object" && origin !== null && isSelf((origin as { sender_user?: unknown }).sender_user, me);
  if (isSelf(m.via_bot, me) || forwardedBot) return [];
  const out: string[] = [];
  for (const button of buttonsOf(m)) {
    if (out.length >= BUTTONS_MAX) break;
    const target = targetOf(button);
    if (target !== null) out.push(clip(target, TARGET_CHARS));
  }
  return out;
}

/**
 * What makes several messages one for the flood limits (flood.ts): an
 * album's media_group_id, and a forward's own date (when it was forwarded,
 * in unix seconds), since forwarding several messages at once sends them in
 * the same second.
 */
export function burstOf(m: TgMessage): { album: string | null; forwardedAt: number | null } {
  const id: unknown = m.media_group_id;
  const album = typeof id === "string" && id !== "" && id.length <= ALBUM_CHARS ? id : null;
  const origin: unknown = m.forward_origin;
  const date: unknown = m.date;
  const forwarded = typeof origin === "object" && origin !== null && typeof date === "number" && Number.isSafeInteger(date);
  return { album, forwardedAt: forwarded ? date : null };
}

/** A reply to a message in another chat; a reply into another topic of the same group carries this chat and doesn't count. */
export function externalFromOtherChat(m: TgMessage): boolean {
  const reply: unknown = m.external_reply;
  if (typeof reply !== "object" || reply === null) return false;
  const id: unknown = (reply as { chat?: { id?: unknown } }).chat?.id;
  return typeof id !== "number" || id !== m.chat.id;
}

const fullName = (user: TgUser | undefined) => `${str(user?.first_name)} ${str(user?.last_name)}`;
const shown = (name: string): string | null => {
  const clean = clip(visibleText(name), 128);
  return clean === "" ? null : clean;
};

/** The name a forward shows: the hidden sender's name, the user's full name, or the chat's or channel's title. Null when it isn't a forward. */
export function forwardName(m: TgMessage): string | null {
  const origin = m.forward_origin;
  if (typeof origin !== "object" || origin === null) return null;
  if (origin.type === "hidden_user") return shown(str(origin.sender_user_name));
  if (origin.type === "user") return shown(fullName(origin.sender_user));
  if (origin.type === "chat") return shown(str(origin.sender_chat?.title));
  if (origin.type === "channel") return shown(str(origin.chat?.title));
  return null;
}

/** The official channel as the worker read TELEGRAM_CHANNEL_ID (community/index-setup.ts readChannel): its chat ID when given one, and its username (lower case, no @). */
export type OfficialChannel = { id: number | null; username: string | null };

/**
 * A forward from the official channel, whose posts are the bot's own (the
 * channel's launch news): a channel post, or a message the channel sent in a
 * group as itself, matched by the chat ID TELEGRAM_CHANNEL_ID gives, and by
 * its username only when it gives none, since a username can pass to another
 * chat. Never without the channel.
 */
export function fromChannel(m: TgMessage, channel: OfficialChannel | null | undefined): boolean {
  const origin: unknown = m.forward_origin;
  if (!channel || typeof origin !== "object" || origin === null) return false;
  const { type, chat, sender_chat: sender } = origin as { type?: unknown; chat?: unknown; sender_chat?: unknown };
  const from: unknown = type === "channel" ? chat : type === "chat" ? sender : undefined;
  if (typeof from !== "object" || from === null) return false;
  const { id, username } = from as { id?: unknown; username?: unknown };
  if (channel.id !== null) return Number.isSafeInteger(channel.id) && channel.id !== 0 && id === channel.id;
  const name = str(channel.username).toLowerCase().replace(/^@/, "");
  return name !== "" && str(username).toLowerCase() === name;
}

/** A forward's username (lower case, no @), when its user, chat or channel has one: how the rules tell the official channel from a look-alike. */
export function forwardUsername(m: TgMessage): string | null {
  const origin = m.forward_origin;
  if (typeof origin !== "object" || origin === null) return null;
  const name = origin.type === "user" ? origin.sender_user?.username : origin.type === "chat" ? origin.sender_chat?.username : origin.type === "channel" ? origin.chat?.username : undefined;
  const username = str(name).toLowerCase();
  return /^[a-z][a-z0-9_]{3,31}$/.test(username) ? username : null;
}
