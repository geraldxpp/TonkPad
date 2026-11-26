import { visibleText } from "../../text";
import { type Command, parseCommand } from "../commands";
import type { TgMessage } from "../types";
import { replyContext, type Span, spanOf, wordsOf } from "./triggers-reply";
import { askPost, forwarded, type Me, viaMe } from "./triggers-via";

export { askLine, askPost, forwarded, forwardedFromMe, isAskLine, isMe, type Me, viaMe } from "./triggers-via";

/**
 * When a message in a community group asks the bot for an answer
 * (prompts/15-community-agent.md, Where it answers): a mention of one of its
 * usernames, /ask, a reply to one of its answers or cards (read in
 * triggers-reply.ts), or inline mode's Ask post once the router paired it
 * with its question (askTrigger), which counts as /ask with that question.
 * Nothing the bot's own inline mode posted is a question by itself
 * (triggers-via.ts). A message's sender or via_bot is the bot by its ID
 * alone; its usernames only find mentions and commands. Text goes through
 * visibleText; length and question checks are the caller's.
 */
export type Trigger = {
  kind: "mention" | "reply" | "ask";
  question: string;
  /** The bot's own answer being replied to, without its label and footer, or null. */
  earlierAnswer: string | null;
  /** The token on the card being replied to, or null. */
  cardAddress: string | null;
  /** "other": the question is another member's message, which /ask replied to. */
  target: "own" | "other";
  /** The message the question came from when it isn't the trigger itself (/ask in reply), or null. */
  targetMessageId: number | null;
};

/**
 * A message's forum topic, or undefined outside one. Telegram also sets
 * message_thread_id on reply chains in ordinary supergroups, so it counts
 * only on a topic message.
 */
export function topicOf(m: TgMessage): number | undefined {
  return m.is_topic_message === true && typeof m.message_thread_id === "number" ? m.message_thread_id : undefined;
}

/** A forum message that "replies" only to its topic's first message, as every message in a topic does: no reply at all. */
export function isTopicRootReply(m: TgMessage): boolean {
  const r = m.reply_to_message;
  if (typeof r !== "object" || r === null) return false;
  if (r.forum_topic_created !== undefined && r.forum_topic_created !== null) return true;
  const topic = topicOf(m);
  return topic !== undefined && r.message_id === topic;
}

/** The message this one really replies to, or null (none, a topic's root, or malformed). */
export function repliedTo(m: TgMessage): TgMessage | null {
  const r = m.reply_to_message;
  if (typeof r !== "object" || r === null || typeof r.message_id !== "number" || isTopicRootReply(m)) return null;
  return r;
}

/** Where the text mentions the bot: a mention entity equal to "@" plus one of its usernames, in any case. */
function botMentions(text: string, entities: readonly unknown[], names: ReadonlySet<string>): Span[] {
  const spans: Span[] = [];
  for (const entity of entities) {
    const span = spanOf(entity, "mention", text);
    const word = span ? text.slice(span[0], span[1]).toLowerCase() : "";
    if (span && word.startsWith("@") && names.has(word.slice(1))) spans.push(span);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/**
 * The text without those spans and the comma or colon after each
 * ("@TonkfunBot, how…" → "how…"), or before one that ends the sentence
 * ("Fees, @TonkfunBot?" → "Fees?").
 */
function cut(text: string, spans: readonly Span[]): string {
  let out = "";
  let at = 0;
  for (const [start, end] of spans) {
    if (start < at) continue;
    const before = text.slice(at, start);
    at = end;
    while (at < text.length && ",:;".includes(text[at])) at += 1;
    const ends = at >= text.length || "?!.？！。".includes(text[at]);
    out += ends ? before.replace(/[\s,:;]+$/u, "") : `${before} `;
  }
  return out + text.slice(at);
}

/** A message's words without its mentions of the bot, through visibleText. */
function question(m: TgMessage, names: ReadonlySet<string>): string {
  const { text, entities } = wordsOf(m);
  return visibleText(cut(text, botMentions(text, entities, names)));
}

/** Who wrote a message: the chat it was sent as (an anonymous admin, a channel), else the person. */
const authorOf = (m: TgMessage): number | null => m.sender_chat?.id ?? m.from?.id ?? null;
/** A bot writing as itself; anonymous admins and channels come with a placeholder bot in `from`. */
const isBot = (m: TgMessage) => m.from?.is_bot === true && !m.sender_chat;

/** /ask for this bot, whichever of its usernames it names; "other" when it names another bot. */
function command(text: string, usernames: readonly string[]): Command | "other" | null {
  let result: Command | "other" | null = null;
  for (const name of usernames.length > 0 ? usernames : [null]) {
    result = parseCommand(text, name);
    if (result !== "other") return result;
  }
  return result;
}

/** The bot's answer or card a question replies to, if any (triggers-reply.ts), and whose question it is. */
function baseOf(m: TgMessage, me: Me, labels: ReadonlySet<string>) {
  const r = repliedTo(m);
  const fromMe = r !== null && r.from?.id === me.id;
  const ctx = fromMe ? replyContext(r, labels) : null;
  return { r, fromMe, ctx, base: { earlierAnswer: ctx?.earlierAnswer ?? null, cardAddress: ctx?.cardAddress ?? null, target: "own" as const, targetMessageId: null } };
}

/**
 * Whether this message asks the bot for an answer, and what it asks. Never
 * for a bot, the bot itself, a forward, anything the bot's own inline mode
 * posted (its card, Ask's line or any other plain message via it: an Ask
 * post asks only once paired, askTrigger), or a command other than /ask.
 * /ask alone, in reply to a person's message, asks that message (target
 * "other" when someone else wrote it); in reply to a bot's message or a
 * channel post's automatic copy, it asks nothing.
 */
export function detectTrigger(m: TgMessage, me: Me, labels: ReadonlySet<string>): Trigger | null {
  if (authorOf(m) === null || isBot(m) || m.from?.id === me.id || forwarded(m) || viaMe(m, me) !== null) return null;
  const usernames = me.usernames.map((u) => u.replace(/^@/, "")).filter(Boolean);
  const names = new Set(usernames.map((u) => u.toLowerCase()));
  const { text, entities } = wordsOf(m);
  const mentions = botMentions(text, entities, names);
  const cmd = command(cut(text, mentions), usernames);
  if (cmd === "other" || (cmd !== null && cmd.name !== "ask")) return null;
  const { r, fromMe, ctx, base } = baseOf(m, me, labels);
  if (cmd !== null) {
    const asked = visibleText(cmd.arg);
    if (asked || r === null || fromMe || isBot(r) || r.is_automatic_forward === true) return { kind: "ask", question: asked, ...base };
    const own = authorOf(r) !== null && authorOf(r) === authorOf(m);
    return { kind: "ask", ...base, question: question(r, names), target: own ? "own" : "other", targetMessageId: r.message_id };
  }
  if (ctx) return { kind: "reply", question: question(m, names), ...base };
  return mentions.length > 0 ? { kind: "mention", question: question(m, names), ...base } : null;
}

/**
 * Inline mode's Ask post, paired by the router with the question it was
 * chosen for (inline-pending.ts): /ask with that question, which the answer
 * replies to the post with, and with the bot's answer or card the post
 * replies to, as any question. Null for anything but a person's own Ask post
 * (triggers-via.ts askPost), or a question with nothing visible.
 */
export function askTrigger(m: TgMessage, me: Me, labels: ReadonlySet<string>, asked: string): Trigger | null {
  const text = visibleText(typeof asked === "string" ? asked : "");
  if (text === "" || !askPost(m, me)) return null;
  return { kind: "ask", question: text, ...baseOf(m, me, labels).base };
}
