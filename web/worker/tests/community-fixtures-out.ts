import type { CommunityOut } from "../src/telegram/community/out";

export interface OutCall {
  op: keyof CommunityOut;
  args: unknown[];
}

/**
 * A CommunityOut that records every call in order and answers as Telegram
 * would when all goes well: sends return new message IDs (from 5001), actions
 * succeed, a member is an ordinary member, a chat is a supergroup without a
 * username. Pass any method in `overrides` to answer differently (a failure,
 * a restricted member); its calls are still recorded.
 */
export function recordOut(overrides: Partial<CommunityOut> = {}): CommunityOut & { log: OutCall[] } {
  const log: OutCall[] = [];
  let nextId = 5_000;
  const base: CommunityOut = {
    send: async () => (nextId += 1),
    edit: async () => true,
    remove: () => undefined,
    removeLater: () => undefined,
    restrict: async () => true,
    restore: async () => true,
    ban: async () => true,
    unban: async () => true,
    kick: async () => true,
    banSenderChat: async () => true,
    typing: async () => undefined,
    answerPress: async () => true,
    admins: async () => [],
    member: async (_chat, user) => ({ status: "member", user: { id: user, is_bot: false, first_name: "Member" } }),
    forget: () => undefined,
    chat: async (chat) => ({ id: chat, type: "supergroup", title: "Group" }),
    memberCount: async () => 10,
    room: () => true,
  };
  const out: CommunityOut = { ...base, ...overrides };
  const note = (op: keyof CommunityOut, ...args: unknown[]) => void log.push({ op, args });
  return {
    log,
    send(chat, html, options) {
      note("send", chat, html, options);
      return out.send(chat, html, options);
    },
    edit(chat, messageId, html, keyboard) {
      note("edit", chat, messageId, html, keyboard);
      return out.edit(chat, messageId, html, keyboard);
    },
    remove(chat, messageIds) {
      note("remove", chat, [...messageIds]);
      out.remove(chat, messageIds);
    },
    removeLater(chat, messageId, afterMs) {
      note("removeLater", chat, messageId, afterMs);
      out.removeLater(chat, messageId, afterMs);
    },
    restrict(chat, user, permissions, untilUnix) {
      note("restrict", chat, user, permissions, untilUnix);
      return out.restrict(chat, user, permissions, untilUnix);
    },
    restore(chat, user, permissions, untilUnix) {
      note("restore", chat, user, permissions, untilUnix);
      return out.restore(chat, user, permissions, untilUnix);
    },
    ban(chat, user) {
      note("ban", chat, user);
      return out.ban(chat, user);
    },
    unban(chat, user) {
      note("unban", chat, user);
      return out.unban(chat, user);
    },
    kick(chat, user) {
      note("kick", chat, user);
      return out.kick(chat, user);
    },
    banSenderChat(chat, senderChat) {
      note("banSenderChat", chat, senderChat);
      return out.banSenderChat(chat, senderChat);
    },
    typing(chat, thread) {
      note("typing", chat, thread);
      return out.typing(chat, thread);
    },
    answerPress(callbackId, text) {
      note("answerPress", callbackId, text);
      return out.answerPress(callbackId, text);
    },
    admins(chat) {
      note("admins", chat);
      return out.admins(chat);
    },
    member(chat, user, read) {
      // A fresh read (a join's) is recorded with how it was asked for; any other as before.
      if (read) note("member", chat, user, read);
      else note("member", chat, user);
      return out.member(chat, user, read);
    },
    forget(chat, user) {
      note("forget", chat, user);
      out.forget(chat, user);
    },
    chat(chat) {
      note("chat", chat);
      return out.chat(chat);
    },
    memberCount(chat) {
      note("memberCount", chat);
      return out.memberCount(chat);
    },
    room(chat, kind) {
      note("room", chat, kind);
      return out.room(chat, kind);
    },
  };
}

/** The recorded calls of one kind, in order. */
export const callsOf = (log: readonly OutCall[], op: keyof CommunityOut): unknown[][] => log.filter((c) => c.op === op).map((c) => c.args);

const QUERIES: ReadonlySet<keyof CommunityOut> = new Set<keyof CommunityOut>(["room", "admins", "member", "forget", "chat", "memberCount"]);

/** The calls that change something (sends, edits, deletes, restrictions, bans…), in order: queries (and forgetting a cached answer) left out. */
export const actionsOf = (log: readonly OutCall[]): OutCall[] => log.filter((c) => !QUERIES.has(c.op));
