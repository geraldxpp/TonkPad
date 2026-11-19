import { isLocale } from "@/shared/i18n/config";
import { cardFor, groupCommand, helpFor, listFor, parseCommand, privateCommand, REFERRAL_PROMPTS, walletReply } from "./commands";
import type { BotContext, Target } from "./context";
import { botLocale, words } from "./i18n";
import { onInline } from "./inline";
import { isLaunchTab } from "./lists";
import { findAddress, isTokenAddress } from "./text";
import type { TgCallbackQuery, TgMessage, TgUpdate } from "./types";
import { checkPrompt, homeView, notAddressView, referralPrompt } from "./views";

export type { BotContext, BotData, InlineArticle, Out, Target } from "./context";
export { parseCommand } from "./commands";
export { inlineArticle } from "./inline";

/** Messages older than this (after downtime) are confirmed without an answer. */
export const STALE_SECONDS = 300;

const hasMedia = (m: TgMessage) =>
  Boolean(m.photo || m.sticker || m.document || m.video || m.animation || m.voice || m.audio || m.video_note || m.location || m.venue || m.contact || m.poll || m.dice);

async function onMessage(m: TgMessage, ctx: BotContext): Promise<void> {
  const from = m.from;
  // For an anonymous admin or someone writing as their channel, `from` is a placeholder bot and sender_chat the author.
  if (!from || (from.is_bot && !m.sender_chat) || ctx.now() / 1000 - m.date > STALE_SECONDS) return;
  const isPrivate = m.chat.type === "private";
  const isGroup = m.chat.type === "group" || m.chat.type === "supergroup";
  if (!isPrivate && !isGroup) return;
  const who = m.sender_chat?.id ?? from.id;
  const lang = botLocale(from.language_code);
  const text = typeof m.text === "string" ? m.text : typeof m.caption === "string" ? m.caption : null;
  if (text === null) {
    // A photo, sticker or file without words, in a private chat: say what the bot needs.
    // Not for each item of an album, where only the captioned item has words.
    if (isPrivate && hasMedia(m) && !m.media_group_id && ctx.limiter.allow(who, ctx.now())) await ctx.out.send(m.chat, notAddressView(lang));
    return;
  }
  const cmd = parseCommand(text, ctx.bot());
  if (cmd === "other" || (isGroup && !cmd) || !ctx.limiter.allow(who, ctx.now())) return;
  if (isGroup && cmd) {
    const view = groupCommand(cmd, m, lang, ctx);
    if (view) await ctx.out.send(m.chat, view, m.message_id);
    return;
  }
  if (cmd) return ctx.out.send(m.chat, privateCommand(cmd, lang, ctx));
  const prompt = m.reply_to_message?.from?.is_bot === true ? m.reply_to_message.text ?? "" : "";
  if (REFERRAL_PROMPTS.has(prompt)) return ctx.out.send(m.chat, walletReply(text, lang, ctx));
  const address = findAddress(text);
  await ctx.out.send(m.chat, address ? cardFor(address, lang, ctx) : notAddressView(lang));
}

async function onCallback(q: TgCallbackQuery, ctx: BotContext): Promise<void> {
  const now = ctx.now();
  const lang = botLocale(q.from.language_code);
  if (!ctx.limiter.allow(q.from.id, now)) {
    if (ctx.pressAll.allow(0, now)) await ctx.out.answer(q.id, words(lang).common.slowDown);
    return;
  }
  const chat = q.message?.chat;
  const target: Target | null = q.message ? { chatId: q.message.chat.id, messageId: q.message.message_id } : q.inline_message_id ? { inlineId: q.inline_message_id } : null;
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
  if (data === "home") return ctx.out.edit(target, homeView(lang, ctx.site), chat);
  if (data === "help") return ctx.out.edit(target, helpFor(lang, ctx, chat?.type !== "private"), chat);
  const tab = kind === "l" ? parts[1] ?? "" : "";
  if (isLaunchTab(tab)) return ctx.out.edit(target, listFor(tab, lang, ctx), chat);
  // A new message only for a press Telegram still accepts: after downtime, old presses aren't acted on.
  if (!chat || !live) return;
  if (data === "check") return ctx.out.send(chat, checkPrompt(lang));
  if (data === "ref") return ctx.out.send(chat, referralPrompt(lang));
  if (kind === "c" && isTokenAddress(address)) return ctx.out.send(chat, cardFor(address, lang, ctx, chat.type !== "private"));
}

/** One update from Telegram, answered through ctx.out. */
export async function handleUpdate(update: TgUpdate, ctx: BotContext): Promise<void> {
  if (update.message) return onMessage(update.message, ctx);
  if (update.callback_query) return onCallback(update.callback_query, ctx);
  if (update.inline_query) return onInline(update.inline_query, ctx);
}
