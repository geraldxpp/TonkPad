import type { TgChatMember, TgUser } from "../types";
import type { ChatId, UserId } from "./types";

const SECOND = 1_000;
/** A join seen in a chat_member update waits this long for its "joined" message, whose ID the check replies to and later deletes. */
export const JOIN_WAIT_MS = SECOND;
/** A join passed on is remembered this long, so the other report of it is skipped (well inside the privacy page's 10 minutes). */
const SEEN_MS = 2 * 60 * SECOND;

/** In the chat: a member, an admin or the creator, or restricted while still in it. */
export function inChat(m: TgChatMember | null | undefined): boolean {
  if (!m) return false;
  if (m.status === "restricted") return m.is_member === true;
  return m.status === "member" || m.status === "administrator" || m.status === "creator";
}

export const isAdmin = (m: TgChatMember | null | undefined): boolean => m?.status === "creator" || m?.status === "administrator";

/** What someone may do as an admin: the creator everything, an administrator its two rights, anyone else nothing. */
export function rightsOf(m: TgChatMember | null | undefined): { delete: boolean; restrict: boolean } {
  if (m?.status === "creator") return { delete: true, restrict: true };
  if (m?.status !== "administrator") return { delete: false, restrict: false };
  return { delete: m.can_delete_messages === true, restrict: m.can_restrict_members === true };
}

/** Someone Telegram named, with a positive whole ID. */
export const validUser = (u: unknown): u is TgUser => typeof u === "object" && u !== null && Number.isSafeInteger((u as TgUser).id) && (u as TgUser).id > 0;

export type PassJoin = (chat: ChatId, users: TgUser[], adder: TgUser | null, joinMessageId: number | null, date: number) => Promise<void>;

export interface Joins {
  /** A join from a chat_member update: passed on after JOIN_WAIT_MS unless its "joined" message comes first, and skipped when that message already passed it on. */
  fromUpdate(chat: ChatId, user: TgUser, adder: TgUser | null, date: number): void;
  /** The "joined" message: everyone on it not yet passed on, at once, with its ID. */
  fromMessage(chat: ChatId, users: readonly TgUser[], adder: TgUser | null, messageId: number | null, date: number): Promise<void>;
  /** Someone left: a join of theirs still waiting is dropped, and their next join counts again. */
  left(chat: ChatId, user: UserId): void;
}

type Timer = ReturnType<typeof setTimeout>;
interface Seen {
  timer: Timer;
  /** The chat_member join still waiting for its message; null once passed on. */
  join: (() => void) | null;
}

/**
 * Telegram reports a join twice: a chat_member update and the "joined"
 * service message, in either order. Each join is passed on once, with the
 * message's ID when it comes within a second. What is remembered (the chat
 * and user IDs) goes after 2 minutes, on a timer that doesn't hold the
 * process open; a leave forgets it at once, so a quick rejoin is checked again.
 */
export function createJoins(pass: PassJoin): Joins {
  const seen = new Map<string, Seen>();
  const keyOf = (chat: ChatId, user: UserId) => `${chat}:${user}`;

  function later(run: () => void, ms: number): Timer {
    const timer = setTimeout(run, ms);
    timer.unref?.();
    return timer;
  }

  function forget(key: string): void {
    const entry = seen.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    seen.delete(key);
  }

  /** Remembers a join for 2 minutes; `join`, when given, runs first, after JOIN_WAIT_MS. */
  function remember(key: string, join: (() => void) | null): void {
    forget(key);
    const entry: Seen = { join, timer: later(() => fire(key, entry), join ? JOIN_WAIT_MS : SEEN_MS) };
    seen.set(key, entry);
  }

  function fire(key: string, entry: Seen): void {
    if (seen.get(key) !== entry) return;
    const join = entry.join;
    if (!join) {
      seen.delete(key);
      return;
    }
    entry.join = null;
    entry.timer = later(() => fire(key, entry), SEEN_MS);
    join();
  }

  return {
    fromUpdate(chat, user, adder, date) {
      const key = keyOf(chat, user.id);
      if (seen.has(key)) return;
      remember(key, () => void pass(chat, [user], adder, null, date));
    },

    async fromMessage(chat, users, adder, messageId, date) {
      const fresh: TgUser[] = [];
      for (const user of users) {
        const key = keyOf(chat, user.id);
        // Passed on already from its chat_member update (or listed twice).
        if (seen.get(key)?.join === null) continue;
        // A chat_member join waiting for this message goes on with it instead.
        remember(key, null);
        fresh.push(user);
      }
      if (fresh.length > 0) await pass(chat, fresh, adder, messageId, date);
    },

    left: (chat, user) => forget(keyOf(chat, user)),
  };
}
