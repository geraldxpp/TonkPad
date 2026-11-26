import { noteLeft } from "../mod/actions-left";
import type { HeldSink } from "../mod/newcomers-held";
import { plainText } from "../text";
import type { TgChatMember, TgChatMemberUpdated, TgMessage, TgUser } from "../types";
import { fillText } from "./controls-people";
import { createJoins, inChat, isAdmin, rightsOf, validUser } from "./members-joins";
import type { CommunityOut } from "./out";
import type { Admins, AlertSink, ChatId, Newcomers, Records, UserId } from "./types";
import type { CommunityDictionary } from "./words";

export interface MembersDeps {
  /** An allow-listed community group: only these are acted on. */
  owns: (chat: ChatId) => boolean;
  records: Records;
  /** The new-member check (mod/newcomers.ts), which also hears what a join update says about the joiner's restriction. */
  newcomers: Newcomers & Partial<HeldSink>;
  /** telegram-out's member cache: every update about someone makes what Telegram said about them before stale. */
  out?: Pick<CommunityOut, "forget">;
  admins: Admins;
  alerts: AlertSink;
  /** The bot's own user ID, once getMe has answered. */
  botId: () => number | null;
  /** TELEGRAM_OWNER_IDS: who added the bot, for the log. */
  owners: readonly UserId[];
  /** The admins' words (TELEGRAM_ADMIN_LANG), for the rights alert. */
  words: CommunityDictionary;
  /** Gets group IDs only: never a user ID or text. */
  log: (line: string) => void;
  now: () => number;
}

export interface Members {
  /** A chat_member update: someone joined, left, or was promoted or demoted. */
  onMember(u: TgChatMemberUpdated): Promise<void>;
  /** A my_chat_member update from any group: logged; in a community group the bot's rights are checked. */
  onMyMember(u: TgChatMemberUpdated): Promise<void>;
  /** The "joined" service message (new_chat_members). */
  onServiceJoin(m: TgMessage): Promise<void>;
  /** The "left" service message (left_chat_member). */
  onServiceLeft(m: TgMessage): void;
}

/**
 * Who comes and goes in the community groups. A join, seen in a
 * chat_member update or in the "joined" message (whichever comes first,
 * passed on once: members-joins.ts), goes to the new-member check, which
 * marks old joins only, skips admins, trusted members and the bot itself,
 * and bans bots a member added. A join update also tells the check whether
 * the joiner is still restricted (a mute Telegram kept while they were
 * away), which the check never shortens, and every update about someone
 * drops what telegram-out kept of their getChatMember answer. Leaving takes
 * them off the check, then deletes their records there (a restriction stays
 * with Telegram), and a late verdict on what they posted before records
 * nothing. A promotion or demotion drops that admin at once and reads the
 * list again. The bot's own membership is logged for any group (its ID and type,
 * and whether an owner added it, never a user ID); in a community group a
 * missing or lost right is alerted. Chats the bot doesn't own are left alone,
 * and nothing here throws.
 */
export function createMembers(deps: MembersDeps): Members {
  const { records, newcomers, admins } = deps;
  const owned = (chat: unknown): chat is ChatId => typeof chat === "number" && Number.isSafeInteger(chat) && chat !== 0 && deps.owns(chat);
  const isBot = (user: TgUser) => user.id === deps.botId();

  async function join(chat: ChatId, users: TgUser[], adder: TgUser | null, joinMessageId: number | null, date: number): Promise<void> {
    try {
      await newcomers.onJoin(chat, users, adder, joinMessageId, date, deps.now());
    } catch {
      deps.log("a join wasn't handled");
    }
  }
  const joins = createJoins(join);

  function left(chat: ChatId, user: UserId): void {
    joins.left(chat, user);
    // First, while their pending check is still in the records: the check message they were on is edited, or deleted with its last newcomer, after a restart too.
    newcomers.onLeave(chat, user);
    records.forgetMember(chat, user);
    // A late verdict on what they posted before leaving records no offence (mod/actions-left.ts).
    noteLeft(records, chat, user, deps.now());
  }

  /** Someone's admin state changed: forget them at once, and read the list again (at most once a minute). */
  function adminChanged(chat: ChatId, user: UserId): void {
    admins.drop(chat, user);
    void admins.refresh(chat, deps.now()).catch(() => undefined);
  }

  /** The bot's rights in a community group after a change to its membership: an alert when one is missing, or was there and is gone. */
  function checkRights(chat: { id: ChatId; title?: string }, before: TgChatMember, after: TgChatMember): void {
    const had = rightsOf(before);
    const has = rightsOf(after);
    if (has.delete && has.restrict) return;
    const lost = (had.delete && !has.delete) || (had.restrict && !has.restrict);
    // done is drawn escaped but not cleaned: a title holding a link, an @handle or a command is cleaned here, so nothing in it is live.
    const group = plainText(typeof chat.title === "string" ? chat.title : "", 64) || String(chat.id);
    deps.alerts.alert({
      chat: chat.id, kind: "rights", category: null, member: null, excerpt: null, link: null,
      done: fillText(deps.words.admin.rights[lost ? "removed" : "missing"], { group }),
      aiGuess: null, undo: null, messageId: null, routine: false, urgent: false,
    });
  }

  return {
    async onMember(u) {
      try {
        const chat = u?.chat?.id;
        const before = u?.old_chat_member;
        const after = u?.new_chat_member;
        const user = after?.user;
        if (!owned(chat) || !before || !after || !validUser(user)) return;
        // Whatever changed, a getChatMember answer kept from before is stale now.
        deps.out?.forget(chat, user.id);
        if (isBot(user)) return;
        if (isAdmin(before) || isAdmin(after)) adminChanged(chat, user.id);
        if (!inChat(before) && inChat(after) && !isAdmin(after)) {
          newcomers.noteHeld?.(chat, user.id, after, deps.now());
          joins.fromUpdate(chat, user, validUser(u.from) ? u.from : null, u.date);
        } else if (inChat(before) && !inChat(after)) left(chat, user.id);
      } catch {
        deps.log("a member update wasn't handled");
      }
    },

    async onMyMember(u) {
      try {
        const chat = u?.chat;
        const before = u?.old_chat_member;
        const after = u?.new_chat_member;
        // Groups only: a private chat's my_chat_member is someone blocking or starting the bot, which is nobody's business.
        if ((chat?.type !== "group" && chat?.type !== "supergroup") || !Number.isSafeInteger(chat.id) || !before || !after) return;
        if (!inChat(before) && inChat(after)) {
          const byOwner = validUser(u.from) && deps.owners.includes(u.from.id);
          deps.log(`added to group ${chat.id} (${chat.type}) by ${byOwner ? "the owner" : "someone else"}`);
        }
        if (!owned(chat.id)) return;
        if (validUser(after.user)) deps.out?.forget(chat.id, after.user.id);
        checkRights(chat, before, after);
      } catch {
        deps.log("a bot membership update wasn't handled");
      }
    },

    async onServiceJoin(m) {
      try {
        const chat = m?.chat?.id;
        if (!owned(chat) || !Array.isArray(m.new_chat_members)) return;
        const users = m.new_chat_members.filter((user): user is TgUser => validUser(user) && !isBot(user));
        for (const user of users) deps.out?.forget(chat, user.id);
        const messageId = Number.isSafeInteger(m.message_id) && m.message_id > 0 ? m.message_id : null;
        await joins.fromMessage(chat, users, validUser(m.from) ? m.from : null, messageId, m.date);
      } catch {
        deps.log("a join wasn't handled");
      }
    },

    onServiceLeft(m) {
      try {
        const chat = m?.chat?.id;
        const user = m?.left_chat_member;
        if (!owned(chat) || !validUser(user) || isBot(user)) return;
        deps.out?.forget(chat, user.id);
        left(chat, user.id);
      } catch {
        deps.log("a leave wasn't handled");
      }
    },
  };
}
