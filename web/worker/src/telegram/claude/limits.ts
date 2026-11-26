import type { ChatId, UserId } from "../community/types";
import type { AiLimits, AnswerLimit, AnswerModel } from "./types";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
/** Past this many keys, a window forgets its stale ones at once, at most once a second (a raid of new accounts can't grow memory). */
const PRUNE_ABOVE = 10_000;
/** The key of a limit shared by everyone. */
const ALL = "all";

/**
 * Answers one chat may run at once, by the answers' model (the answers'
 * queue, agent/jobs.ts; model#4): 2 on Sonnet 5.5 and Opus 5.5, whose
 * answers can take up to 60 seconds, so a second asker isn't held behind the
 * first; 1 on Haiku 5.5, which answers within 45.
 */
export const ANSWERS_AT_ONCE: Readonly<Record<AnswerModel, number>> = Object.freeze({ "claude-haiku-5-5": 1, "claude-sonnet-5-5": 2, "claude-opus-5-5": 2 });

/**
 * Uses per key within one sliding window, like limiter.ts. Keys are IDs (a
 * user, a chat, or "<chat>:<user>"); a key with nothing left in its window is
 * forgotten by prune(), so no user ID outlives the longest user window (10
 * minutes).
 */
class Window {
  private readonly hits = new Map<string, number[]>();
  private prunedAt = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly max: number,
    private readonly ms: number,
  ) {}

  /** Uses still inside the window. */
  count(key: string, now: number): number {
    return this.recent(key, now).length;
  }

  room(key: string, now: number): boolean {
    return this.count(key, now) < this.max;
  }

  add(key: string, now: number): void {
    this.hits.set(key, [...this.recent(key, now), now]);
    if (this.hits.size > PRUNE_ABOVE && now - this.prunedAt >= SECOND) this.prune(now);
  }

  prune(now: number): void {
    this.prunedAt = now;
    for (const [key, times] of this.hits) if (times.every((at) => now - at >= this.ms)) this.hits.delete(key);
  }

  keys(): string[] {
    return [...this.hits.keys()];
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.ms);
  }
}

const utcDay = (now: number): string => new Date(Math.abs(now) <= 8.64e15 ? now : 0).toISOString().slice(0, 10);

/**
 * The AI's pace limits (prompts/15-community-agent.md, Per-user and per-chat
 * limits), in memory only. Each check that passes also counts that use; one
 * that fails counts nothing. keys() lists what the windows hold, for tests
 * and /status.
 */
export function createAiLimits(): AiLimits & { keys(): string[] } {
  // Answers, groups and private chats together.
  const userFast = new Window(1, 15 * SECOND);
  const userSlow = new Window(8, 10 * MINUTE);
  const cooling = new Window(Number.POSITIVE_INFINITY, 10 * MINUTE);
  // Answers in one group, and one asker there.
  const chatMinute = new Window(4, MINUTE);
  const chatHour = new Window(60, HOUR);
  const askerInChat = new Window(2, MINUTE);
  const privateAll = new Window(10, MINUTE);
  const everyone = new Window(30, MINUTE);
  // Unprompted answers: per group, and the same member there.
  const proactiveChat = new Window(1, 3 * MINUTE);
  const proactiveUser = new Window(1, 10 * MINUTE);
  const proactiveDay = new Map<ChatId, { day: string; n: number }>();
  const triageChat = new Window(30, MINUTE);
  const triageAll = new Window(120, MINUTE);
  const reports = new Window(3, 10 * MINUTE);
  const presses = new Window(8, 10 * SECOND);
  // The busy reply to an asker whose answer was dropped from the queue (model#4).
  const busyReplies = new Window(1, 10 * MINUTE);
  const windows = [
    userFast, userSlow, cooling, chatMinute, chatHour, askerInChat, privateAll, everyone,
    proactiveChat, proactiveUser, triageChat, triageAll, reports, presses, busyReplies,
  ];

  /** One use against one window, counted only when it fits. */
  const once = (window: Window, key: string, now: number): boolean => {
    if (!window.room(key, now)) return false;
    window.add(key, now);
    return true;
  };

  return {
    /**
     * The cooldown first, then the asker's own pace (1 per 15 s, 8 per 10
     * minutes), then the group's (4 a minute, 60 an hour, and one asker at
     * most 2 a minute there: past those, "busy"), private chats' (10 a
     * minute), and everyone's (30 a minute).
     */
    answer(user: UserId, chat: ChatId | null, now: number): AnswerLimit {
      const u = String(user);
      if (cooling.count(u, now) > 0) return "cooldown";
      if (!userFast.room(u, now) || !userSlow.room(u, now)) return "user";
      const group = chat === null ? null : String(chat);
      const asker = `${chat}:${user}`;
      if (group !== null && (!chatMinute.room(group, now) || !chatHour.room(group, now) || !askerInChat.room(asker, now))) return "chat";
      if (group === null && !privateAll.room(ALL, now)) return "private";
      if (!everyone.room(ALL, now)) return "global";
      for (const w of [userFast, userSlow]) w.add(u, now);
      if (group === null) privateAll.add(ALL, now);
      else {
        chatMinute.add(group, now);
        chatHour.add(group, now);
        askerInChat.add(asker, now);
      }
      everyone.add(ALL, now);
      return "ok";
    },

    /** At most one every 3 minutes and 30 a UTC day in a group, and the same member once per 10 minutes. */
    proactive(chat: ChatId, user: UserId, now: number): boolean {
      const group = String(chat);
      const pair = `${chat}:${user}`;
      const day = utcDay(now);
      const today = proactiveDay.get(chat);
      const n = today?.day === day ? today.n : 0;
      if (n >= 30 || !proactiveChat.room(group, now) || !proactiveUser.room(pair, now)) return false;
      proactiveDay.set(chat, { day, n: n + 1 });
      proactiveChat.add(group, now);
      proactiveUser.add(pair, now);
      return true;
    },

    /** 30 checks a minute per group, 120 overall; past that, rules only. */
    triage(chat: ChatId, now: number): boolean {
      const group = String(chat);
      if (!triageChat.room(group, now) || !triageAll.room(ALL, now)) return false;
      triageChat.add(group, now);
      triageAll.add(ALL, now);
      return true;
    },

    report: (user, now) => once(reports, String(user), now),

    press: (user, now) => once(presses, String(user), now),

    /** Answers stop for 10 minutes from the latest refusal or max_tokens stop; true only for the second within 10 minutes. */
    coolDown(user: UserId, now: number): boolean {
      const u = String(user);
      const second = cooling.count(u, now) === 1;
      cooling.add(u, now);
      return second;
    },

    /** Each asker at most once per 10 minutes, in groups and private chats together; forgotten by prune() 10 minutes after. */
    busyReply: (user, now) => once(busyReplies, String(user), now),

    prune(now: number): void {
      for (const w of windows) w.prune(now);
      const day = utcDay(now);
      for (const [chat, count] of proactiveDay) if (count.day !== day) proactiveDay.delete(chat);
    },

    keys: () => windows.flatMap((w) => w.keys()),
  };
}
