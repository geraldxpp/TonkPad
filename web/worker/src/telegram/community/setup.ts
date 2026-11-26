import { plainText } from "../text";
import type { TgChatMember } from "../types";
import { fillText } from "./controls-people";
import { inChat, rightsOf } from "./members-joins";
import type { CommunityOut } from "./out";
import { type Read, readWatched, retryingReader } from "./setup-read";
import { type FailureWatch, type ReadFailure, UPGRADED } from "./setup-status";
import { type AutoDelete, autoDeleteOf, setupAlert } from "./setup-watch";
import type { AdminAlert, AlertSink, ChatId, UserId } from "./types";
import type { CommunityDictionary } from "./words";

export { type Read, retryingReader } from "./setup-read";
export { type AutoDelete, createAdminChatWatch } from "./setup-watch";

/** A check's answer: passed, failed for certain, or not answered (Telegram couldn't be read). */
export type Verdict = "ok" | "off" | "unsure";

/** Why a group was dropped for certain: the bot lacks a right, no owner controls it, or the bot isn't in it any more (left or removed). */
export type GroupProblem = "rights" | "owner" | "gone";

export interface SetupResult {
  /** The community groups to run: those that passed, and those whose checks Telegram couldn't answer (in `unsure`); empty when community mode is off. */
  chats: ChatId[];
  /** The admin chat: passed, failed for certain (community mode off), or unsure (it runs, alerts wait, and the checks are tried again). */
  adminChat: Verdict;
  /** Community mode may run: the admin chat didn't fail for certain. */
  adminChatOk: boolean;
  /** Groups whose checks Telegram couldn't answer: they run, and are checked again. */
  unsure: ChatId[];
  /** Groups the bot is no longer in, for certain: dropped, and their records are forgotten (missing rights alone keep them). */
  gone: ChatId[];
  /** The admin chat's auto-delete timer: a week or less, missing or longer ("long"), or unknown. */
  autoDelete: AutoDelete;
  /** One English line per problem for the log: group IDs, never a user ID. */
  notes: string[];
}

export interface SetupDeps {
  out: CommunityOut;
  chats: readonly ChatId[];
  adminChat: ChatId;
  owners: readonly UserId[];
  botId: number;
  /** The Security page's contact as the site reported it: none turns community mode off. */
  contact: "set" | "none" | "unknown";
  /** A dropped group, the missing contact or the auto-delete timer is alerted here, unless the admin chat failed for certain. */
  alerts: AlertSink;
  /** The admins' words (TELEGRAM_ADMIN_LANG). */
  words: CommunityDictionary;
  /** Waits between tries of a failed read: 1 and 2 seconds unless given (none: one try). */
  waits?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** What Telegram answers when a read fails (setup-status.ts): without it, every failed read is unsure. */
  failures?: FailureWatch;
}

/** Whether some owner's place in the chat is one `ok` accepts: "off" only when Telegram answered for every owner (a place, or a definite no). */
async function anyOwner(deps: SetupDeps, chat: ChatId, ok: (m: TgChatMember) => boolean, read: Read): Promise<Verdict> {
  let unread = false;
  for (const owner of deps.owners) {
    const got = await readWatched(deps.failures, read, "getChatMember", chat, owner, () => deps.out.member(chat, owner));
    if (got.value && ok(got.value)) return "ok";
    if (!got.value && got.failure?.definite !== true) unread = true;
  }
  return unread ? "unsure" : "off";
}

/** Telegram's own words about the chat for the log: printable characters only, at most 120. */
const said = (f: ReadFailure) => {
  const words = f.description.replace(/[^\x20-\x7e -￿]/g, " ").trim().slice(0, 120);
  return `Telegram says ${f.status}${words ? `: ${words}` : ""}`;
};

/** The log line for an admin chat Telegram refused for certain: upgraded to a supergroup (it has a new ID), or not found or not reachable by the bot. */
function adminChatRefused(f: ReadFailure): string {
  if (UPGRADED.test(f.description)) {
    return `community mode off: the admin chat was upgraded to a supergroup and has a new ID (${said(f)}): set TELEGRAM_ADMIN_CHAT_ID to the new -100… ID (remove the bot from the admin chat and add it again; the log then says "added to group …")`;
  }
  return `community mode off: the admin chat can't be reached (${said(f)}): add the bot to the team's admin group, or set TELEGRAM_ADMIN_CHAT_ID to that group's -100… ID`;
}

/** The admin chat gets names, usernames and excerpts: it must be private and have an owner in it. Refused for certain, it is off; unread, unsure. */
export async function checkAdminChat(deps: SetupDeps, notes: string[], read: Read): Promise<{ verdict: Verdict; autoDelete: AutoDelete }> {
  const unsure = { verdict: "unsure" as const, autoDelete: null };
  const got = await readWatched(deps.failures, read, "getChat", deps.adminChat, null, () => deps.out.chat(deps.adminChat));
  const chat = got.value;
  if (!chat && got.failure?.definite === true) {
    notes.push(adminChatRefused(got.failure));
    return { verdict: "off", autoDelete: null };
  }
  if (!chat) {
    notes.push("the admin chat can't be read yet (is the bot in it?): community mode runs, its alerts wait, and it is checked again shortly");
    return unsure;
  }
  if (typeof chat.username === "string" && chat.username !== "") {
    notes.push("the admin chat has a public username: make it private");
    return { verdict: "off", autoDelete: null };
  }
  const owner = await anyOwner(deps, deps.adminChat, inChat, read);
  if (owner === "off") {
    notes.push("no owner (TELEGRAM_OWNER_IDS) is a member of the admin chat");
    return { verdict: "off", autoDelete: null };
  }
  if (owner === "unsure") {
    notes.push("the owners' places in the admin chat can't be read yet: community mode runs, its alerts wait, and it is checked again shortly");
    return unsure;
  }
  return { verdict: "ok", autoDelete: autoDeleteOf(chat) };
}

/**
 * A community group's problems for certain (the bot isn't in it any more,
 * lacks Delete messages or Ban users, or no owner controls it), and whether
 * any check went unread.
 */
export async function checkGroup(deps: SetupDeps, chat: ChatId, notes: string[], read: Read): Promise<{ problems: GroupProblem[]; unsure: boolean }> {
  const problems: GroupProblem[] = [];
  const got = await readWatched(deps.failures, read, "getChatMember", chat, deps.botId, () => deps.out.member(chat, deps.botId));
  const bot = got.value;
  // Left or removed (its own place says so, or Telegram refuses the group for certain): nothing else there can be checked.
  if (bot ? !inChat(bot) : got.failure?.definite === true) {
    const why = bot ? `its place there is "${bot.status}"` : got.failure ? said(got.failure) : "";
    notes.push(`community group ${chat} dropped: the bot isn't in it any more (${why}), so its records there are forgotten`);
    return { problems: ["gone"], unsure: false };
  }
  const rights = rightsOf(bot);
  if (bot && (!rights.delete || !rights.restrict)) {
    const missing = [rights.delete ? "" : "Delete messages", rights.restrict ? "" : "Ban users"].filter(Boolean).join(" and ");
    notes.push(`community group ${chat} dropped: the bot lacks ${missing} there`);
    problems.push("rights");
  }
  const controls = (m: TgChatMember) => m.status === "creator" || (m.status === "administrator" && m.can_restrict_members === true);
  const owner = await anyOwner(deps, chat, controls, read);
  if (owner === "off") {
    notes.push(`community group ${chat} dropped: no owner (TELEGRAM_OWNER_IDS) is its creator or an admin with Ban users`);
    problems.push("owner");
  }
  const unsure = problems.length === 0 && (!bot || owner === "unsure");
  if (unsure) notes.push(`community group ${chat}: its checks can't be read yet (is the bot in it?); it runs, and they are tried again shortly`);
  return { problems, unsure };
}

/** The alerts for a dropped group, by its title as getChat gives it, cleaned (done is drawn escaped, not cleaned), or its ID. A group the bot left has none of its rights there. */
export async function droppedAlerts(deps: SetupDeps, chat: ChatId, problems: readonly GroupProblem[]): Promise<AdminAlert[]> {
  const title = (await deps.out.chat(chat).catch(() => null))?.title;
  const group = plainText(typeof title === "string" ? title : "", 64) || String(chat);
  const w = deps.words.admin;
  return problems.map((p) => (p === "owner" ? setupAlert(chat, "setup", fillText(w.setup.owner, { group })) : setupAlert(chat, "rights", fillText(w.rights.missing, { group }))));
}

/**
 * The checks at start (prompts/15-community-agent.md, Setup checks): an
 * owner must be the creator, or an admin with Ban users, of each community
 * group; the bot must hold Delete messages and Ban users there; the admin
 * chat must have no public username and an owner in it, and auto-delete
 * set to a week or less; and the site must name a Security contact. A read
 * that fails is tried again after 1 and 2 seconds, unless Telegram answered
 * for certain (a 4xx other than 429). Only a definite answer acts: a group
 * the bot isn't in, or with a missing right or no owner, is dropped; an
 * admin chat Telegram refuses (not found, upgraded to a supergroup, 403),
 * with a public username or no owner, or no contact, turns community mode
 * off. What Telegram still couldn't answer (a network error, a 429, a 5xx)
 * runs, as unsure, and is checked again from the tick (setup-retry.ts).
 * Each problem is a log note and, unless the admin chat failed for certain,
 * an alert.
 */
export async function checkSetup(deps: SetupDeps): Promise<SetupResult> {
  const notes: string[] = [];
  const alerts: AdminAlert[] = [];
  const read = retryingReader(deps.waits, deps.sleep);
  const admin = await checkAdminChat(deps, notes, read);
  const chats: ChatId[] = [];
  const unsure: ChatId[] = [];
  const gone: ChatId[] = [];
  for (const chat of deps.chats) {
    const group = await checkGroup(deps, chat, notes, read);
    if (group.problems.length > 0) {
      if (group.problems.includes("gone")) gone.push(chat);
      alerts.push(...(await droppedAlerts(deps, chat, group.problems)));
      continue;
    }
    chats.push(chat);
    if (group.unsure) unsure.push(chat);
  }
  if (admin.autoDelete === "long") alerts.push(setupAlert(null, "setup", deps.words.admin.setup.autoDelete));
  if (admin.verdict === "off") notes.push("community mode off: the admin chat failed its checks");
  if (deps.contact === "none") {
    notes.push("community mode off: the site's Security page has no contact");
    alerts.push(setupAlert(null, "setup", deps.words.admin.setup.contact));
  } else if (deps.contact === "unknown") {
    notes.push('the site\'s Security contact couldn\'t be read: answers point to "the contact on the Security page"');
  }
  if (admin.verdict !== "off") for (const a of alerts) deps.alerts.alert(a);
  const on = admin.verdict !== "off" && deps.contact !== "none";
  return { chats: on ? chats : [], adminChat: admin.verdict, adminChatOk: admin.verdict !== "off", unsure: on ? unsure : [], gone, autoDelete: admin.autoDelete, notes };
}
