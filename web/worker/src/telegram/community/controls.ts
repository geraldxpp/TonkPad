import type { Locale } from "@/shared/i18n/config";
import type { AiLimits, Budget } from "../claude/types";
import { pressMatches } from "../press";
import type { TgCallbackQuery, TgMessage, TgUser, View } from "../types";
import { trustedView, trustMember } from "./controls-members";
import { adminChatNotes } from "./controls-notes";
import { ADMIN_CHAT_COMMANDS, aiSwitch, type Change, changeOf, type Command, GROUP_COMMANDS, onOff, panelView, parsePanel, rightFor } from "./controls-panel";
import { alertMember, authorOf, groupHtml, personText, repliedTo, topicOf, userIdArg } from "./controls-people";
import { type PressReply, pressLimit, pressReply } from "./controls-press";
import type { CommunityOut } from "./out";
import type { AdminRight, Admins, AlertSink, ChatId, RaidControl, Records, UserId } from "./types";
import type { CommunityDictionary } from "./words";

export interface ControlDeps {
  out: CommunityOut;
  records: Records;
  admins: Admins;
  /** The day's AI budget, or null when no model call can run at all. */
  budget: Budget | null;
  raid: RaidControl;
  alerts: AlertSink;
  adminChat: ChatId;
  /** The allow-listed community groups. */
  chats: readonly ChatId[];
  words: (lang: Locale) => CommunityDictionary;
  /** The admin chat's language. */
  adminWords: CommunityDictionary;
  /** A group's /status view (community/status.ts). */
  status: (chat: ChatId) => View;
  limits: AiLimits;
  now: () => number;
}

/**
 * The admins' controls (prompts/15-community-agent.md, Admin controls). In a
 * community group a control command is deleted at once, whoever sent it;
 * only someone with the right changes anything, and every change is
 * confirmed in the admin chat with who made it. Anonymous admins can't be
 * tied to a person, so they are refused with a note there. The admin chat
 * has /mod, /status, /forget <id> and /ai, and the panel's buttons, each
 * checked against the presser's right in that group and answered once.
 */
export function createControls(deps: ControlDeps): { onCommand(m: TgMessage, cmd: Command): Promise<boolean>; onPress(q: TgCallbackQuery): Promise<boolean> } {
  const { out, records, admins, budget, raid, alerts, adminChat, chats, adminWords: w, status } = deps;
  const members = { out, records, admins, adminWords: w, now: deps.now };
  const { note, confirm, post, answer } = adminChatNotes({ out, alerts, adminChat, adminWords: w });
  const withinLimit = pressLimit(deps.limits);

  /** Whether this person holds the right in this group; owners may also do what any admin may. Fails closed. */
  async function allowed(chat: ChatId, user: UserId, right: AdminRight): Promise<boolean> {
    const can = (r: AdminRight) => admins.can(chat, user, r, deps.now()).catch(() => false);
    return (await can(right)) || (right === "any" && (await can("owner")));
  }

  async function chatsWhere(user: UserId, right: AdminRight): Promise<ChatId[]> {
    const found: ChatId[] = [];
    for (const chat of chats) if (await allowed(chat, user, right)) found.push(chat);
    return found;
  }

  /** A group's title, as getChat gives it (cached), or its ID. */
  const titleOf = async (chat: ChatId) => (await out.chat(chat))?.title ?? String(chat);

  const panel = (chat: ChatId): View =>
    panelView(chat, status(chat), { settings: records.settings(chat), raid: raid.active(chat, deps.now()), ai: aiSwitch(budget?.status(deps.now()) ?? null) }, w);

  function setAi(on: boolean, admin: TgUser): void {
    if (!budget) return;
    budget.setOn(on, deps.now());
    confirm(null, on ? "aiOn" : "aiOff", { admin: personText(admin) });
  }

  /** Makes a change and confirms it. Asking for the state a group already has confirms it again; raid mode only starts or ends once. */
  function apply(change: Change, chat: ChatId, admin: TgUser, group: string): void {
    const now = deps.now();
    const values = { admin: personText(admin), group };
    switch (change.kind) {
      case "paused":
        records.updateSettings(chat, { paused: change.on });
        return confirm(chat, change.on ? "paused" : "resumed", values);
      case "proactive":
        records.updateSettings(chat, { proactive: change.on });
        return confirm(chat, change.on ? "proactiveOn" : "proactiveOff", values);
      case "strictness":
        records.updateSettings(chat, { strictness: change.level });
        return confirm(chat, "strictness", { ...values, level: w.admin.levels[change.level] });
      case "raid":
        if (change.on && !raid.active(chat, now)) raid.start(chat, "admin", now);
        if (!change.on && raid.active(chat, now)) raid.end(chat, now);
        return confirm(chat, change.on ? "raidOn" : "raidOff", values);
      case "ai":
        return setAi(change.on, admin);
    }
  }

  /** /trust, /untrust and /forget: the member the command replies to, or for /forget an ID after it. */
  async function onMember(m: TgMessage, admin: TgUser, cmd: Command, group: string): Promise<void> {
    const chat = m.chat.id;
    const replied = repliedTo(m);
    const author = replied ? authorOf(replied) : null;
    const target = author?.kind === "person" ? author.user : null;
    const values = { admin: personText(admin), group };
    if (cmd.name === "forget") {
      const id = userIdArg(cmd.arg) ?? target?.id ?? null;
      if (id === null) return confirm(chat, "noReply", values);
      records.forgetMember(chat, id);
      return confirm(chat, "forgotten", values);
    }
    if (!target) return confirm(chat, "noReply", values);
    if (cmd.name === "trust") await trustMember(members, chat, target);
    else records.untrust(chat, target.id);
    // Named without the ID: with one, the alerts would hold a quick untrust back as a repeat.
    confirm(chat, cmd.name === "trust" ? "trusted" : "untrusted", values, alertMember(target, false));
  }

  async function inGroup(m: TgMessage, right: AdminRight, cmd: Command): Promise<void> {
    const chat = m.chat.id;
    out.remove(chat, [m.message_id]);
    // An anonymous admin writes as the group itself; anyone else writing as a chat is no admin.
    if (m.sender_chat) return m.sender_chat.id === chat ? note(chat, w.admin.anonymous) : undefined;
    const from = m.from;
    if (!from || from.is_bot === true || !(await allowed(chat, from.id, right))) return;
    const group = m.chat.title ?? String(chat);
    const change = changeOf(cmd);
    if (change) return apply(change, chat, from, group);
    if (cmd.name === "status") return post(status(chat));
    if (cmd.name === "trusted") return post(await trustedView(members, chat, groupHtml(chat, m.chat.title)));
    if (cmd.name === "trust" || cmd.name === "untrust" || cmd.name === "forget") return onMember(m, from, cmd, group);
    // /mod, or a switch without a value it knows: the panel shows every choice.
    return post(panel(chat));
  }

  async function inAdminChat(m: TgMessage, cmd: Command): Promise<void> {
    const from = m.from;
    if (m.sender_chat) return m.sender_chat.id === adminChat ? answer(m, w.admin.anonymous) : undefined;
    if (!from || from.is_bot === true) return;
    if (cmd.name === "status" || cmd.name === "mod") {
      for (const chat of await chatsWhere(from.id, "any")) await post(cmd.name === "status" ? status(chat) : panel(chat), { thread: topicOf(m) });
      return;
    }
    const owned = await chatsWhere(from.id, "owner");
    if (owned.length === 0) return answer(m, w.admin.onlyOwners);
    if (cmd.name === "ai") {
      const on = onOff(cmd.arg);
      return on === null ? undefined : setAi(on, from);
    }
    const id = userIdArg(cmd.arg);
    if (id === null) return;
    for (const chat of owned) {
      records.forgetMember(chat, id);
      confirm(chat, "forgotten", { admin: personText(from), group: await titleOf(chat) });
    }
  }

  /** A panel press: from the admin chat, on a button the bot really shows, for an allow-listed group, within the press limit, with the right. */
  async function press(q: TgCallbackQuery, reply: PressReply): Promise<void> {
    const p = parsePanel(q.data ?? "");
    const m = q.message;
    if (!p || !m || m.chat.id !== adminChat || !chats.includes(p.chat) || !pressMatches(q)) return reply.say();
    if (!(await withinLimit(q, reply, deps.now()))) return;
    if (!(await allowed(p.chat, q.from.id, rightFor(p.change)))) return reply.say(w.admin.onlyOwners);
    apply(p.change, p.chat, q.from, await titleOf(p.chat));
    await reply.say(w.admin.done);
    const view = panel(p.chat);
    await out.edit(adminChat, m.message_id, view.text, view.keyboard);
  }

  return {
    async onCommand(m, cmd) {
      const inAdmin = m.chat.id === adminChat;
      const right = !inAdmin && chats.includes(m.chat.id) && m.is_automatic_forward !== true ? GROUP_COMMANDS.get(cmd.name) : undefined;
      if (inAdmin ? !ADMIN_CHAT_COMMANDS.has(cmd.name) : !right) return false;
      try {
        await (right ? inGroup(m, right, cmd) : inAdminChat(m, cmd));
      } catch {
        // A control must never break the update loop; each change is one step, so sending it again finishes it.
      }
      return true;
    },

    async onPress(q) {
      if (typeof q.data !== "string" || !q.data.startsWith("p:")) return false;
      const reply = pressReply(out, q);
      try {
        await press(q, reply);
      } catch {
        // As above: a panel press is the admin chat's, whatever happens to it.
        await reply.say().catch(() => undefined);
      }
      return true;
    },
  };
}
