import { isLocale } from "@/shared/i18n/config";
import { answerLabels } from "./agent/render";
import { topicOf } from "./agent/triggers";
import { aiOn, cardFor, helpFor, listFor } from "./commands";
import type { CommunityHooks } from "./community/types";
import type { BotContext, Target } from "./context";
import { botLocale, words } from "./i18n";
import { COMMUNITY_DICTIONARIES } from "./i18n/community";
import { isLaunchTab } from "./lists";
import { pressMatches } from "./press";
import { isTokenAddress } from "./text";
import type { TgCallbackQuery, TgChat, TgMessage } from "./types";
import { checkPrompt, homeView, referralPrompt } from "./views";

/**
 * Button presses. A press counts only when its message still shows a button
 * with exactly that data (press.ts): any other is answered silently and goes
 * nowhere. Presses in a community group, the admin chat or a private chat go
 * to the community agent first; module 14's own buttons, and every press in
 * any other chat or on an inline message, are answered here.
 */

/** Every language's "AI answer" label: an AI answer is known by its first line. */
const ANSWER_LABELS = answerLabels(Object.values(COMMUNITY_DICTIONARIES));

const isAnswer = (m: TgMessage | undefined): m is TgMessage =>
  m !== undefined && typeof m.text === "string" && ANSWER_LABELS.has(m.text.split("\n")[0].trim());

/** Where the community agent may take a press: its own groups, the admin chat, and private chats. */
const forCommunity = (community: CommunityHooks, chat: TgChat) =>
  chat.type === "private" || community.owns(chat.id) || community.isAdminChat(chat.id);

/** A new message the press would post: always in a private chat; in a group once per message and button in 10 minutes. */
function mayPost(q: TgCallbackQuery, chat: TgChat, ctx: BotContext): boolean {
  if (chat.type === "private") return true;
  return ctx.groupPosts.first(`${chat.id}:${q.message?.message_id ?? 0}:${q.data ?? ""}`, ctx.now());
}

/** Module 14's buttons: menus edit in place, cards refresh in place, and a few post a new message. */
async function onCallback(q: TgCallbackQuery, ctx: BotContext): Promise<void> {
  const now = ctx.now();
  const lang = botLocale(q.from.language_code);
  if (!ctx.limiter.allow(q.from.id, now)) {
    if (ctx.pressAll.allow(0, now)) await ctx.out.answer(q.id, words(lang).common.slowDown);
    return;
  }
  const message = q.message;
  const chat = message?.chat;
  const target: Target | null = message ? { chatId: message.chat.id, messageId: message.message_id } : q.inline_message_id ? { inlineId: q.inline_message_id } : null;
  const data = q.data ?? "";
  const parts = data.split(":");
  const kind = parts[0];
  const raw = (parts.length === 3 ? parts[2] : parts[1]) ?? "";
  const address = raw.startsWith("0x") ? raw.toLowerCase() : raw;
  // Without data a press changes nothing: the message keeps its buttons, and a toast says why.
  if ((kind === "r" || kind === "l" || kind === "c") && !ctx.data.ready()) {
    await ctx.out.answer(q.id, words(lang).common.unavailable);
    return;
  }
  if (kind === "r" && isTokenAddress(address)) {
    // A card's Refresh carries the card's own language (r:<lang>:<address>), so one person's press never changes it for everyone.
    const cardLang = parts.length === 3 && isLocale(parts[1]) ? parts[1] : lang;
    await ctx.out.answer(q.id, words(lang).card.refreshed);
    if (target) await ctx.out.edit(target, cardFor(address, cardLang, ctx, chat?.type !== "private"), chat);
    return;
  }
  const live = await ctx.out.answer(q.id);
  if (!target) return;
  const shared = chat?.type !== "private";
  // The Ask button works only in a private chat: never in a menu many people read.
  if (data === "home") return ctx.out.edit(target, homeView(lang, ctx.site, { ai: !shared && aiOn(ctx) }), chat);
  if (data === "help") return ctx.out.edit(target, helpFor(lang, ctx, shared, chat?.id), chat);
  const tab = kind === "l" ? parts[1] ?? "" : "";
  // An AI answer's Latest launches button opens the list below it: the answer stays as it is, for everyone.
  if (isLaunchTab(tab) && !isAnswer(message)) return ctx.out.edit(target, listFor(tab, lang, ctx), chat);
  // A new message only for a press Telegram still accepts: after downtime, old presses aren't acted on.
  if (!chat || !live || !message) return;
  if (isLaunchTab(tab)) {
    if (mayPost(q, chat, ctx)) await ctx.out.send(chat, listFor(tab, lang, ctx), message.message_id, topicOf(message));
    return;
  }
  // A prompt waits for a reply that only a private chat reads: in a group it would go nowhere.
  if (data === "check" && !shared) return ctx.out.send(chat, checkPrompt(lang));
  if (data === "ref" && !shared) return ctx.out.send(chat, referralPrompt(lang));
  if (kind === "c" && isTokenAddress(address) && mayPost(q, chat, ctx)) return ctx.out.send(chat, cardFor(address, lang, ctx, shared), undefined, topicOf(message));
}

/** A button press: checked against its message, then the community agent's or module 14's. */
export async function onPress(q: TgCallbackQuery, ctx: BotContext): Promise<void> {
  if (typeof q?.id !== "string" || typeof q.from?.id !== "number") return;
  if (!pressMatches(q)) {
    // Data that isn't on its message (made up by a client, or a message too old to read): answered silently, nothing else.
    if (ctx.limiter.allow(q.from.id, ctx.now())) await ctx.out.answer(q.id);
    return;
  }
  const community = ctx.community;
  const chat = q.message?.chat;
  if (community && chat && typeof chat.id === "number" && forCommunity(community, chat) && (await community.onPress(q))) return;
  await onCallback(q, ctx);
}
