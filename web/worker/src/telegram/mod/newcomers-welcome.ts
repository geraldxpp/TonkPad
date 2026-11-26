import type { Locale } from "@/shared/i18n/config";
import type { ChatId, UserId } from "../community/types";
import type { ModDeps } from "./actions";
import { welcomeHtml, welcomeKeyboard } from "./newcomers-view";
import { sendAndExpire } from "./notices";

/**
 * One welcome per 20 seconds for everyone who passed in that time ("Welcome
 * to tonkfun.fun's community, …"), with a Privacy button, deleted after 2
 * minutes together with their join messages. Holds user IDs for 20 seconds.
 * The tick sends it and returns: it never waits on the group's queue.
 */

const WINDOW_MS = 20_000;
export const WELCOME_KEEP_MS = 120_000;

interface Batch {
  users: UserId[];
  joins: number[];
  due: number;
}

export interface Welcomes {
  /** Welcomes `user` in the next batch (null: only their join message goes with it). */
  add(chat: ChatId, user: UserId | null, joinMessageId: number | null, now: number): void;
  /** Someone who left isn't welcomed; their join message still goes. */
  drop(chat: ChatId, user: UserId): void;
  /** The group is no longer run: its welcome isn't sent. */
  dropChat(chat: ChatId): void;
  tick(now: number): void;
}

export function createWelcomes(deps: Pick<ModDeps, "out" | "words" | "site" | "log"> & { groupLang: Locale }): Welcomes {
  const batches = new Map<ChatId, Batch>();
  return {
    add(chat, user, joinMessageId, now) {
      const b = batches.get(chat) ?? { users: [], joins: [], due: now + WINDOW_MS };
      if (user !== null && !b.users.includes(user)) b.users.push(user);
      if (joinMessageId !== null) b.joins.push(joinMessageId);
      batches.set(chat, b);
    },
    drop(chat, user) {
      const b = batches.get(chat);
      if (b) b.users = b.users.filter((u) => u !== user);
    },
    dropChat: (chat) => void batches.delete(chat),
    tick(now) {
      for (const [chat, b] of [...batches]) {
        if (b.due > now) continue;
        batches.delete(chat);
        for (const id of new Set(b.joins)) deps.out.removeLater(chat, id, WELCOME_KEEP_MS);
        if (b.users.length === 0) continue;
        const d = deps.words(deps.groupLang);
        void sendAndExpire(deps, chat, welcomeHtml(b.users.map((id) => ({ id })), d), { kind: "notice", keyboard: welcomeKeyboard(d, deps.site) }, WELCOME_KEEP_MS);
      }
    },
  };
}
