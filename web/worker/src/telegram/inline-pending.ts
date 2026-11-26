import { askPost } from "./agent/triggers";
import type { BotContext } from "./context";
import { type Later, timers } from "./inline-wait";
import type { TgMessage } from "./types";

/**
 * Inline mode's Ask, paired with its question (prompts/15-community-agent.md,
 * Inline Ask). The Ask result posts only a fixed line ("Asked TonkFun a
 * question.", agent/triggers-via.ts askPost), and Telegram's
 * chosen_inline_result (inline.ts onChosen) tells the bot which question the
 * person chose it for, though not in which chat: the result's ID says the
 * kind of chat it was offered in (askResultId: a supergroup or the bot's own
 * chat). That question waits here for the person's post in that kind of
 * chat, by their user ID and the kind: 60 seconds at most, the newest of
 * each kind, 1,000 questions at most. The post takes it, or waits up to 5
 * seconds for it when it comes first. A question counts only for a post sent
 * at most 10 seconds after it came: one chosen in the bot's own chat never
 * answers a group post, nor the reverse, and one chosen earlier never does,
 * but one chosen in another supergroup within those seconds still could
 * (Telegram names no chat). The question is never posted, logged or stored
 * anywhere else; the sweep (index.ts) forgets what waited too long.
 */

/** A question waits this long at most for its post… */
export const PENDING_MS = 60_000;
/** …and a post this long at most for its question. */
export const PAIR_MS = 5_000;
/** Questions waiting, at most (past this the oldest goes), and posts waiting at once. */
export const PENDING_MAX = 1_000;
/** A question counts for a post sent at most this long after it came: Telegram sends both at once, give or take its queue and the clocks. */
export const SAME_TIME_MS = 10_000;

/** The kind of chat an Ask result was offered in, as its ID says: "g" a supergroup (every community group is one), "p" the bot's own chat. */
export type AskChat = "g" | "p";

/** The Ask result's ID ("ask:g", "ask:p"): the chosen result names no chat, so the ID keeps the kind (a card's ID is its token's address). */
export const askResultId = (chat: AskChat): string => `ask:${chat}`;

/** The kind of chat an Ask result's ID names, or null for any other result: a card's, or one this bot doesn't make. */
export const askChatOf = (resultId: unknown): AskChat | null => (resultId === "ask:g" ? "g" : resultId === "ask:p" ? "p" : null);

/** The kind of chat a post is in: a supergroup, or a private chat (the bot's own); null in any other, where Ask is never offered. */
const postChat = (m: TgMessage): AskChat | null => (m.chat?.type === "supergroup" ? "g" : m.chat?.type === "private" ? "p" : null);

/** A question chosen with Ask, the kind of chat its result was offered in, and when it came (ms, ctx.now()). */
export interface PendingAsk {
  question: string;
  chat: AskChat;
  at: number;
}

interface Waiter {
  person: number;
  chat: AskChat;
  since: number;
  done(ask: PendingAsk | null): void;
}

/** Each person's question of each kind. */
const keyOf = (person: number, chat: AskChat): string => `${person}:${chat}`;

/** The questions waiting for their posts, and the posts waiting for their questions. */
export class PendingAsks {
  private readonly asks = new Map<string, PendingAsk>();
  private readonly waiting: Waiter[] = [];

  constructor(private readonly later: Later = timers) {}

  /** A person's question: straight to their first post waiting for one of its kind, else kept (the newest of its kind wins). */
  put(person: number, ask: PendingAsk): void {
    const i = this.waiting.findIndex((w) => w.person === person && w.chat === ask.chat && ask.at >= w.since);
    if (i >= 0) {
      this.waiting.splice(i, 1)[0].done(ask);
      return;
    }
    const key = keyOf(person, ask.chat);
    this.asks.delete(key);
    this.asks.set(key, ask);
    const oldest = this.asks.size > PENDING_MAX ? this.asks.keys().next().value : undefined;
    if (oldest !== undefined) this.asks.delete(oldest);
  }

  /** The person's question of this kind that came from `since` on and at most 60 seconds before `now`, taken; one that doesn't fit goes too. */
  take(person: number, chat: AskChat, now: number, since = Number.NEGATIVE_INFINITY): PendingAsk | null {
    const key = keyOf(person, chat);
    const ask = this.asks.get(key);
    if (!ask) return null;
    this.asks.delete(key);
    return ask.at >= since && now - ask.at <= PENDING_MS ? ask : null;
  }

  /** take(), or the person's next question of this kind within `ms`; null when none comes (or too many posts wait already). */
  wait(person: number, chat: AskChat, now: number, since: number, ms = PAIR_MS): Promise<PendingAsk | null> {
    const ask = this.take(person, chat, now, since);
    if (ask !== null || this.waiting.length >= PENDING_MAX) return Promise.resolve(ask);
    return new Promise((resolve) => {
      let cancel = (): void => undefined;
      const waiter: Waiter = {
        person,
        chat,
        since,
        done: (found) => {
          cancel();
          resolve(found);
        },
      };
      this.waiting.push(waiter);
      cancel = this.later(() => {
        const at = this.waiting.indexOf(waiter);
        if (at >= 0) this.waiting.splice(at, 1);
        resolve(null);
      }, ms);
    });
  }

  /** Forgets every question past its 60 seconds. */
  prune(now: number): void {
    for (const [key, ask] of this.asks) if (now - ask.at > PENDING_MS) this.asks.delete(key);
  }

  /** How many questions wait, and how many posts wait for theirs. */
  get size(): number {
    return this.asks.size;
  }

  get waiters(): number {
    return this.waiting.length;
  }

  /** The bot stops: every question goes, and every waiting post gets none. */
  stop(): void {
    this.asks.clear();
    for (const waiter of this.waiting.splice(0)) waiter.done(null);
  }
}

/** Each Ask post's pairing, by its update object: started by the router (startPairing), read by the community agent (pairingOf). */
const pairings = new WeakMap<TgMessage, Promise<PendingAsk | null>>();

/**
 * Starts pairing a person's own Ask post (askPost) with its question: theirs
 * chosen for the post's kind of chat (a community group's post a question
 * offered in a supergroup, the bot's own chat's one offered there) that came
 * from 10 seconds before the post was sent, or the next within 5 seconds;
 * without the store, none. Null for any other message, which pairs with
 * nothing. Started once per message: the router starts it as the message
 * comes, and nothing waits on it there.
 */
export function startPairing(m: TgMessage, ctx: BotContext): Promise<PendingAsk | null> | null {
  const person = m.from?.id;
  const chat = postChat(m);
  if (chat === null || !askPost(m, ctx.me()) || typeof person !== "number" || typeof m.date !== "number") return null;
  const known = pairings.get(m);
  if (known) return known;
  const store = ctx.pendingAsks;
  const pairing = store ? store.wait(person, chat, ctx.now(), m.date * 1000 - SAME_TIME_MS) : Promise.resolve(null);
  pairings.set(m, pairing);
  return pairing;
}

/** The pairing the router started for this message, or null: none for anything but a person's own Ask post. */
export const pairingOf = (m: TgMessage): Promise<PendingAsk | null> | null => pairings.get(m) ?? null;
