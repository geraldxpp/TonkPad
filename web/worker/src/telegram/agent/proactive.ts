import type { Locale } from "@/shared/i18n/config";
import type { ChatId, Standing, UserId } from "../community/types";
import type { TgMessage } from "../types";
import { repliedTo, topicOf } from "./triggers";

/**
 * Unprompted answers (prompts/15-community-agent.md, Unprompted answers): a
 * question Haiku's check found waits 90 seconds, and the bot answers it
 * only if nobody replied and no admin or trusted member posted in its chat
 * and topic meanwhile, never twice in a row without a person writing in
 * between, and never the same member twice in 10 minutes. The caller's
 * allowed() checks the rest (settings, observe mode, budget, limits, raids).
 * All in memory: a candidate's text for at most 2 minutes, user IDs for at
 * most 10, and otherwise chat and message IDs only.
 */

export interface Candidate {
  chat: ChatId;
  messageId: number;
  user: UserId;
  /** The question, cleaned. */
  text: string;
  lang: Locale;
  /** Its forum topic (topicOf in triggers.ts), so the answer goes there. */
  thread?: number;
  /** When it was posted, ms, on the clock `now` comes from. */
  at: number;
}

export interface Proactive {
  /** A question nobody asked the bot: kept until it is handed out, cancelled or 2 minutes old. */
  offer(c: Candidate): void;
  /** Every message in a community group, the question itself included, with its author's standing; an edit drops its own candidate. */
  noteMessage(m: TgMessage, standing: Standing, now: number): void;
  /**
   * The candidates to answer now, at most one per chat, each handed out
   * once. allowed() runs after the guards here, so a check that counts a use
   * (limits.proactive) counts only these; one turned down stays until it is
   * 2 minutes old.
   */
  due(now: number, allowed: (c: Candidate) => boolean): Candidate[];
  /** The bot answered someone unprompted in this chat. */
  noteAnswered(chat: ChatId, user: UserId, now: number): void;
  prune(now: number): void;
}

export const WAIT_MS = 90_000;
export const MAX_AGE_MS = 2 * 60_000;
/** The same member gets at most one unprompted answer per chat in this long. */
const ASKER_MS = 10 * 60_000;
const MAX_CANDIDATES = 500;
/** Replied-to messages and recent askers each keep at most this many keys. */
const MAX_KEYS = 5_000;
const MAX_STAFF_POSTS = 50;

/** An admin's or trusted member's post: no user ID, just where it was. */
interface StaffPost {
  id: number;
  forum: boolean;
  topic: number | undefined;
  at: number;
}

const keyOf = (chat: ChatId, id: number) => `${chat}:${id}`;

/** A person's new message: not a bot (anonymous admins and channels count), a channel's automatic copy or a join or leave notice. */
const isHuman = (m: TgMessage) =>
  (m.from !== undefined || m.sender_chat !== undefined) &&
  !(m.from?.is_bot === true && !m.sender_chat) &&
  m.is_automatic_forward !== true &&
  m.new_chat_members === undefined &&
  m.left_chat_member === undefined &&
  m.forum_topic_created === undefined;

/** Sets a key as the newest, forgetting the oldest past `max`. */
function remember<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= max) break;
    map.delete(oldest);
  }
}

export function createProactive(options: { waitMs?: number; maxAgeMs?: number } = {}): Proactive {
  const waitMs = options.waitMs ?? WAIT_MS;
  const maxAgeMs = options.maxAgeMs ?? MAX_AGE_MS;
  const candidates = new Map<string, Candidate>();
  /** Messages someone replied to, kept as long as a candidate lives: one may be offered after its reply came in. */
  const replied = new Map<string, number>();
  const staff = new Map<ChatId, StaffPost[]>();
  const lastHuman = new Map<ChatId, number>();
  const lastAnswered = new Map<ChatId, number>();
  /** "<chat>:<user>" → when the bot last answered them unprompted. */
  const askers = new Map<string, number>();

  /** A staff post after the question (message IDs only grow), in its chat's topic; a group without topics is one topic. */
  const silences = (p: StaffPost, c: Candidate) => p.id > c.messageId && (!p.forum || p.topic === c.thread);
  const cancelled = (c: Candidate) => replied.has(keyOf(c.chat, c.messageId)) || (staff.get(c.chat) ?? []).some((p) => silences(p, c));
  /** Someone wrote since the bot's last unprompted answer there. */
  const rowOpen = (chat: ChatId) => {
    const answered = lastAnswered.get(chat);
    return answered === undefined || (lastHuman.get(chat) ?? Number.NEGATIVE_INFINITY) > answered;
  };
  const askerRested = (c: Candidate, now: number) => {
    const at = askers.get(keyOf(c.chat, c.user));
    return at === undefined || now - at >= ASKER_MS;
  };
  /** The caller's own checks; one that throws counts as a no. */
  const passes = (allowed: (c: Candidate) => boolean, c: Candidate) => {
    try {
      return allowed(c) === true;
    } catch {
      return false;
    }
  };

  return {
    offer(c) {
      const key = keyOf(c.chat, c.messageId);
      if (candidates.has(key) || cancelled(c)) return;
      // The question is itself a person writing, whether or not noteMessage saw it first.
      lastHuman.set(c.chat, Math.max(lastHuman.get(c.chat) ?? c.at, c.at));
      remember(candidates, key, c, MAX_CANDIDATES);
    },

    noteMessage(m, standing, now) {
      const chat = m.chat?.id;
      if (typeof chat !== "number" || typeof m.message_id !== "number") return;
      if (m.edit_date !== undefined) {
        // An edited question is no longer the one that was checked; an edit is nobody posting.
        candidates.delete(keyOf(chat, m.message_id));
        return;
      }
      const r = repliedTo(m);
      if (r) {
        candidates.delete(keyOf(chat, r.message_id));
        remember(replied, keyOf(chat, r.message_id), now, MAX_KEYS);
      }
      if (!isHuman(m)) return;
      lastHuman.set(chat, now);
      if (standing !== "admin" && standing !== "trusted") return;
      const post: StaffPost = { id: m.message_id, forum: m.chat.is_forum === true, topic: topicOf(m), at: now };
      staff.set(chat, [...(staff.get(chat) ?? []), post].slice(-MAX_STAFF_POSTS));
      for (const [key, c] of candidates) if (c.chat === chat && silences(post, c)) candidates.delete(key);
    },

    due(now, allowed) {
      const ready: Candidate[] = [];
      const chats = new Set<ChatId>();
      for (const [key, c] of candidates) {
        const age = now - c.at;
        if (age > maxAgeMs || cancelled(c)) {
          candidates.delete(key);
          continue;
        }
        if (age < waitMs || chats.has(c.chat) || !rowOpen(c.chat) || !askerRested(c, now) || !passes(allowed, c)) continue;
        candidates.delete(key);
        chats.add(c.chat);
        ready.push(c);
      }
      return ready;
    },

    noteAnswered(chat, user, now) {
      lastAnswered.set(chat, now);
      remember(askers, keyOf(chat, user), now, MAX_KEYS);
    },

    prune(now) {
      for (const [key, c] of candidates) if (now - c.at > maxAgeMs) candidates.delete(key);
      for (const [key, at] of replied) if (now - at > maxAgeMs) replied.delete(key);
      for (const [chat, posts] of staff) {
        const kept = posts.filter((p) => now - p.at <= maxAgeMs);
        if (kept.length > 0) staff.set(chat, kept);
        else staff.delete(chat);
      }
      for (const times of [lastHuman, lastAnswered]) for (const [chat, at] of times) if (now - at >= ASKER_MS) times.delete(chat);
      for (const [key, at] of askers) if (now - at >= ASKER_MS) askers.delete(key);
    },
  };
}
