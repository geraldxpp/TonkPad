import type { Sender } from "../sender";
import type { TgChatFull, TgChatMember } from "../types";
import type { CommunityOut } from "./out";
import { createCache } from "./telegram-out-cache";
import type { ChatId, UserId } from "./types";

const validChat = (chat: unknown): chat is ChatId => typeof chat === "number" && Number.isSafeInteger(chat) && chat !== 0;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const isMember = (m: TgChatMember | null): m is TgChatMember => typeof m?.status === "string" && typeof m.user?.id === "number";
/** An admin's answer isn't kept: the bot's own rights (and an owner's) must show a change at once, in /status and the setup checks. */
const notAdmin = (m: TgChatMember) => m.status !== "creator" && m.status !== "administrator";
const isChat = (c: TgChatFull | null): c is TgChatFull => typeof c?.id === "number";

export type Reads = Pick<CommunityOut, "admins" | "member" | "chat" | "memberCount" | "forget"> & { prune(now: number): void };

/** A fresh read goes out within this time or not at all: a joiner it double-checks is already restricted. */
const FRESH_WAIT_MS = 5_000;

/**
 * telegram-out's reads, each through sender.direct in the reads' lane (after
 * moderation calls, before messages). getChatMember (but for admins),
 * getChat and getChatMemberCount are kept 10 minutes; a member's answer is
 * forgotten after an action on them and on every update about them
 * (forget), since any change makes it stale. A fresh member read (a join's)
 * skips what is kept and waits after messages, within 5 seconds or not at
 * all. getChatAdministrators is read every time: community/admins.ts keeps
 * the lists and must see a promotion or demotion at once.
 */
export function createReads(deps: { sender: Sender; now: () => number; noteMigration: (chat: ChatId) => void }): Reads {
  const { sender, now } = deps;
  const members = createCache<TgChatMember>(now, notAdmin);
  const chats = createCache<TgChatFull>(now);
  const counts = createCache<number>(now);
  const read = <T>(method: string, params: Record<string, unknown>) => sender.direct<T>(method, params, { priority: "read" });

  return {
    async admins(chat) {
      if (!validChat(chat)) return null;
      const list = await read<TgChatMember[]>("getChatAdministrators", { chat_id: chat });
      return Array.isArray(list) ? list : null;
    },

    async member(chat, user, how = {}) {
      if (!validChat(chat) || !positive(user)) return null;
      const key = `${chat}:${user}`;
      const params = { chat_id: chat, user_id: user };
      // Fresh: what was kept, and a read already under way, may be from before the join.
      if (how.fresh === true) members.drop(key);
      return members.get(key, async () => {
        const m = how.fresh === true
          ? await sender.direct<TgChatMember>("getChatMember", params, { priority: "verify", maxWaitMs: FRESH_WAIT_MS })
          : await read<TgChatMember>("getChatMember", params);
        return isMember(m) ? m : null;
      });
    },

    async chat(chat) {
      if (!validChat(chat)) return null;
      return chats.get(String(chat), async () => {
        const c = await read<TgChatFull>("getChat", { chat_id: chat });
        if (c === null) deps.noteMigration(chat);
        return isChat(c) ? c : null;
      });
    },

    async memberCount(chat) {
      if (!validChat(chat)) return null;
      return counts.get(String(chat), async () => {
        const n = await read<number>("getChatMemberCount", { chat_id: chat });
        return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
      });
    },

    forget: (chat: ChatId, user: UserId) => members.drop(`${chat}:${user}`),

    prune(at) {
      members.prune(at);
      chats.prune(at);
      counts.prune(at);
    },
  };
}
