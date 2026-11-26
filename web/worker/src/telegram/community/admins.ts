import type { TgChatMember, TgUser } from "../types";
import type { CommunityOut } from "./out";
import type { AdminInfo, AdminRight, Admins, ChatId, UserId } from "./types";

const MINUTE = 60_000;
/** A group's list is read again once it is this old (the privacy page says every 10 minutes). */
const LIST_MS = 10 * MINUTE;
/** At most one read a minute per group, however often one is asked for… */
const REFRESH_GAP_MS = MINUTE;
/** …or every 30 seconds while Telegram has never confirmed the group's list (the tick asks that often). */
const UNCONFIRMED_GAP_MS = 30_000;
/** A list Telegram hasn't confirmed for this long grants no right any more: rights checks fail closed. */
const RIGHTS_MS = 30 * MINUTE;

export interface AdminsDeps {
  out: CommunityOut;
  /** TELEGRAM_OWNER_IDS: with each group's creator, the owners. */
  owners: readonly UserId[];
  /** The bot's own user ID, once getMe has answered. */
  botId: () => number | null;
  now: () => number;
}

interface ChatAdmins {
  admins: readonly AdminInfo[];
  /** When Telegram last answered (ms). */
  at: number;
  /** A promotion or demotion was seen since: read again at the next chance. */
  stale: boolean;
}

/** Someone's full name as Telegram shows it (folded for impersonation checks elsewhere). */
const fullName = (user: TgUser): string => [user.first_name, user.last_name].filter((part) => typeof part === "string" && part !== "").join(" ");

/** One entry of getChatAdministrators, or null when it isn't an admin's. The creator holds every right. */
function toAdmin(member: TgChatMember): AdminInfo | null {
  const user = member.user;
  if (typeof user?.id !== "number" || !Number.isSafeInteger(user.id)) return null;
  if (member.status !== "creator" && member.status !== "administrator") return null;
  const creator = member.status === "creator";
  return {
    id: user.id,
    name: fullName(user),
    username: typeof user.username === "string" && user.username !== "" ? user.username : null,
    creator,
    anonymous: member.is_anonymous === true,
    canDelete: creator || member.can_delete_messages === true,
    canRestrict: creator || member.can_restrict_members === true,
  };
}

/** Still in the group: a member, an admin or the creator, or restricted while still in it. */
function present(member: TgChatMember | null): boolean {
  if (!member) return false;
  if (member.status === "restricted") return member.is_member === true;
  return member.status === "member" || member.status === "administrator" || member.status === "creator";
}

/** The lists as community/index.ts holds them: also whether Telegram has confirmed a group's list yet, and a read for the start's retries. */
export interface AdminLists extends Admins {
  /** Whether Telegram has answered getChatAdministrators for this group at least once: until then nobody there is known to be an admin. */
  known(chat: ChatId): boolean;
  /** Reads the list now, whatever the gap (one read at a time per group); true once it is known. */
  load(chat: ChatId, now: number): Promise<boolean>;
}

/**
 * Each community group's admins, from getChatAdministrators. A list is kept
 * in memory and read again when it is 10 minutes old, at most once a minute
 * per group (every 30 seconds while none was ever confirmed); a failed read
 * keeps the last one. A promotion or demotion seen in a chat_member update
 * drops that person at once and marks the list for a new read. Rights
 * checks fail closed: no list (or none confirmed for 30 minutes) grants
 * nothing, and an anonymous admin never passes, since what they do can't be
 * tied to a person.
 */
export function createAdmins(deps: AdminsDeps): AdminLists {
  const { out, owners, botId } = deps;
  const lists = new Map<ChatId, ChatAdmins>();
  const tried = new Map<ChatId, number>();
  const reading = new Map<ChatId, Promise<void>>();

  async function read(chat: ChatId, now: number): Promise<void> {
    let members: TgChatMember[] | null = null;
    try {
      members = await out.admins(chat);
    } catch {
      members = null;
    }
    // A failed read keeps the last good list: forgetting it would moderate the real admins.
    if (!Array.isArray(members)) return;
    const admins = members.map(toAdmin).filter((a): a is AdminInfo => a !== null);
    lists.set(chat, { admins, at: now, stale: false });
  }

  /** One read at a time per group: a second ask while one runs waits for it. */
  function start(chat: ChatId, now: number): Promise<void> {
    const running = reading.get(chat);
    if (running) return running;
    tried.set(chat, now);
    const run = read(chat, now).finally(() => reading.delete(chat));
    reading.set(chat, run);
    return run;
  }

  function refresh(chat: ChatId, now: number): Promise<void> {
    const running = reading.get(chat);
    if (running) return running;
    const last = tried.get(chat);
    const gap = lists.has(chat) ? REFRESH_GAP_MS : UNCONFIRMED_GAP_MS;
    if (last !== undefined && now - last < gap) return Promise.resolve();
    return start(chat, now);
  }

  async function member(chat: ChatId, user: UserId): Promise<TgChatMember | null> {
    try {
      return await out.member(chat, user);
    } catch {
      return null;
    }
  }

  const find = (chat: ChatId, user: UserId): AdminInfo | null => lists.get(chat)?.admins.find((a) => a.id === user) ?? null;

  return {
    list: (chat) => lists.get(chat)?.admins ?? [],
    isAdmin: (chat, user) => find(chat, user) !== null,

    async can(chat: ChatId, user: UserId, right: AdminRight, now: number): Promise<boolean> {
      const known = lists.get(chat);
      if (!known || known.stale || now - known.at >= LIST_MS) await refresh(chat, now);
      const current = lists.get(chat);
      const admin = current && now - current.at < RIGHTS_MS ? (current.admins.find((a) => a.id === user) ?? null) : null;
      if (admin?.anonymous) return false;
      if (right === "owner") {
        if (admin?.creator) return true;
        if (!owners.includes(user)) return false;
        if (admin) return true;
        // An owner from the config counts while still in the group, but not as an anonymous admin there.
        const seen = await member(chat, user);
        return present(seen) && seen?.is_anonymous !== true;
      }
      if (!admin) return false;
      if (right === "delete") return admin.creator || admin.canDelete;
      if (right === "restrict") return admin.creator || admin.canRestrict;
      return true;
    },

    async botRights(chat) {
      const id = botId();
      if (id === null) return null;
      const me = await member(chat, id);
      if (!me) return null;
      if (me.status === "creator") return { delete: true, restrict: true };
      if (me.status !== "administrator") return { delete: false, restrict: false };
      return { delete: me.can_delete_messages === true, restrict: me.can_restrict_members === true };
    },

    refresh,

    known: (chat) => lists.has(chat),

    async load(chat, now) {
      await start(chat, now);
      return lists.has(chat);
    },

    drop(chat, user) {
      const known = lists.get(chat);
      if (known) lists.set(chat, { ...known, admins: known.admins.filter((a) => a.id !== user), stale: true });
    },
  };
}
