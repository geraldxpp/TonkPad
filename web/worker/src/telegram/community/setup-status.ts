import { type BotApi, TelegramError } from "../api";
import type { ChatId, UserId } from "./types";

/**
 * What Telegram said when a setup read failed (prompts/15-community-agent.md,
 * Setup checks). `definite` when it answered for certain: a 4xx other than
 * 429, such as 400 "chat not found", 400 "group chat was upgraded to a
 * supergroup" or 403 (the bot isn't in the chat, or was removed). A network
 * error, a timeout, a 429 or a 5xx is no answer: the check stays unsure.
 */
export interface ReadFailure {
  definite: boolean;
  status: number;
  /** Telegram's own words about the chat, never anyone's text. */
  description: string;
}

/** Setup's reads, each watched while it runs for what Telegram answers if it fails. */
export interface FailureWatch {
  read<T>(method: string, chat: ChatId, user: UserId | null, load: () => Promise<T | null>): Promise<{ value: T | null; failure: ReadFailure | null }>;
}

/** A 4xx other than 429: Telegram's own answer, which asking again won't change. */
export const isDefinite = (status: number): boolean => status >= 400 && status < 500 && status !== 429;

/** Telegram's words when a basic group's old ID is used after it became a supergroup. */
export const UPGRADED = /upgraded to a supergroup/i;

const keyOf = (method: string, chat: unknown, user: unknown) => `${method}:${String(chat)}:${user === undefined || user === null ? "" : String(user)}`;

function failureOf(error: unknown): ReadFailure {
  return error instanceof TelegramError ? { definite: isDefinite(error.status), status: error.status, description: error.description } : { definite: false, status: 0, description: "" };
}

/**
 * The bot's API with a watch on failures (telegram/index.ts puts it under
 * the Sender, which keeps no status of its own): while a setup read runs, a
 * failure of that same call (its method, chat and person) is noted and
 * handed back with the read's result; a later success clears it. Nothing
 * else is kept: no other call's failure, and nothing once the read is over.
 */
export function watchFailures(api: BotApi): { api: BotApi; watch: FailureWatch } {
  const watched = new Map<string, Set<{ failure: ReadFailure | null }>>();
  const note = (method: string, params: Record<string, unknown>, failure: ReadFailure | null) => {
    for (const read of watched.get(keyOf(method, params.chat_id, params.user_id)) ?? []) read.failure = failure;
  };
  return {
    api: {
      async call<T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T> {
        try {
          const result = await api.call<T>(method, params, timeoutMs);
          note(method, params, null);
          return result;
        } catch (error) {
          note(method, params, failureOf(error));
          throw error;
        }
      },
    },
    watch: {
      async read<T>(method: string, chat: ChatId, user: UserId | null, load: () => Promise<T | null>) {
        const key = keyOf(method, chat, user);
        const mine = { failure: null as ReadFailure | null };
        const reads = watched.get(key) ?? new Set();
        reads.add(mine);
        watched.set(key, reads);
        try {
          const value = await load().catch(() => null);
          return { value, failure: value === null ? mine.failure : null };
        } finally {
          reads.delete(mine);
          if (reads.size === 0 && watched.get(key) === reads) watched.delete(key);
        }
      },
    },
  };
}
