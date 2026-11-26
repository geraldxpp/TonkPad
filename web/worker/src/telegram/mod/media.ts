import { clip, visibleText } from "../../text";
import type { TgMessage, TgUser } from "../types";

/**
 * What a message carries besides its words: a risky file, link buttons
 * (another bot's, and every button's target for the link rules), a reply to
 * another chat, where a forward came from, and what makes several messages
 * one for the flood limits. Telegram's fields are untrusted, so each is
 * checked before it is read.
 */

/** The bot itself (agent/triggers.ts Me): its own inline cards and buttons are never another bot's. */
export type Self = { id: number; usernames: readonly string[] };

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

const lower = (name: unknown) => str(name).toLowerCase().replace(/^@/, "");

/** Whether a user is the bot, by its ID or any of its usernames; never when the bot doesn't know itself yet. */
function isSelf(user: unknown, me: Self | null | undefined): boolean {
  if (!me || typeof user !== "object" || user === null) return false;
  const { id, username } = user as { id?: unknown; username?: unknown };
  if (typeof id === "number" && id === me.id) return true;
  const name = lower(username);
  return name !== "" && me.usernames.some((u) => lower(u) === name);
}

/** The buttons of a message's inline keyboard; malformed rows and buttons are skipped. */
function buttonsOf(m: TgMessage): object[] {
  const markup: unknown = m.reply_markup;
  const rows: unknown = typeof markup === "object" && markup !== null ? (markup as { inline_keyboard?: unknown }).inline_keyboard : undefined;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: unknown) => (Array.isArray(row) ? row.filter((b: unknown): b is object => typeof b === "object" && b !== null) : []));
}

const linkButton = (button: object) => "url" in button || "login_url" in button || "web_app" in button;

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

/** A forward's username (lower case, no @), when its user, chat or channel has one: how the rules tell the official channel from a look-alike. */
export function forwardUsername(m: TgMessage): string | null {
  const origin = m.forward_origin;
  if (typeof origin !== "object" || origin === null) return null;
  const name = origin.type === "user" ? origin.sender_user?.username : origin.type === "chat" ? origin.sender_chat?.username : origin.type === "channel" ? origin.chat?.username : undefined;
  const username = str(name).toLowerCase();
  return /^[a-z][a-z0-9_]{3,31}$/.test(username) ? username : null;
}
