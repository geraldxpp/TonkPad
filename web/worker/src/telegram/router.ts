import { topicOf } from "./agent/triggers";
import { commandOf, groupCommand } from "./commands";
import { inChat } from "./community/members-joins";
import type { BotContext } from "./context";
import { botLocale } from "./i18n";
import { onInline } from "./inline";
import { onPress } from "./router-press";
import { onPrivate } from "./router-private";
import type { TgChat, TgChatMemberUpdated, TgMessage, TgUpdate } from "./types";
import { notAddressView } from "./views";

export type { BotContext, BotData, InlineArticle, Out, Target } from "./context";
export { parseCommand } from "./commands";
export { inlineArticle } from "./inline";

/**
 * Where each update goes. The community agent (module 15) sees only its
 * allow-listed groups (messages, edits, member updates, presses), the
 * team's admin chat (messages and presses) and private chats (through its
 * private calls); every other chat, and inline mode, stays module 14's and
 * never reaches it, so nothing from there goes to Anthropic.
 */

/** Messages older than this (after downtime) are confirmed without an answer. */
export const STALE_SECONDS = 300;

const hasMedia = (m: TgMessage) =>
  Boolean(m.photo || m.sticker || m.document || m.video || m.animation || m.voice || m.audio || m.video_note || m.location || m.venue || m.contact || m.poll || m.dice);

/** A chat's ID when Telegram sent a usable one. */
const chatIdOf = (chat: TgChat | undefined): number | null => (typeof chat?.id === "number" && Number.isSafeInteger(chat.id) ? chat.id : null);
const isGroupChat = (chat: TgChat | undefined) => chat?.type === "group" || chat?.type === "supergroup";

async function onMessage(m: TgMessage, ctx: BotContext): Promise<void> {
  const chat = chatIdOf(m?.chat);
  if (chat === null) return;
  const stale = typeof m.date !== "number" || ctx.now() / 1000 - m.date > STALE_SECONDS;
  // A community group or the admin chat: the community agent first, before any limit, media and stale messages included; "pass" leaves /check and /help to module 14.
  const community = ctx.community;
  if (community && (community.owns(chat) || community.isAdminChat(chat)) && (await community.onMessage(m, stale)) === "handled") return;
  const from = m.from;
  // For an anonymous admin or someone writing as their channel, `from` is a placeholder bot and sender_chat the author.
  if (!from || (from.is_bot && !m.sender_chat) || stale) return;
  const isPrivate = m.chat.type === "private";
  const isGroup = isGroupChat(m.chat);
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
  const cmd = commandOf(text, ctx);
  if (cmd === "other" || (isGroup && !cmd) || !ctx.limiter.allow(who, ctx.now())) return;
  if (isGroup && cmd) {
    const view = groupCommand(cmd, m, lang, ctx);
    if (view) await ctx.out.send(m.chat, view, m.message_id, topicOf(m));
    return;
  }
  await onPrivate(m, from, text, cmd, lang, ctx);
}

/** An edit: only in a community group, where it is moderated like a new message. */
async function onEdited(m: TgMessage, ctx: BotContext): Promise<void> {
  const chat = chatIdOf(m?.chat);
  if (chat !== null && ctx.community?.owns(chat)) await ctx.community.onEdited(m);
}

/** Someone joining, leaving or changing rights: only in a community group. */
async function onMember(u: TgChatMemberUpdated, ctx: BotContext): Promise<void> {
  const chat = chatIdOf(u?.chat);
  if (chat !== null && ctx.community?.owns(chat)) await ctx.community.onMember(u);
}

/**
 * The bot's own membership in a group (never a private chat, where it means
 * someone started or blocked the bot). With the community agent on it notes
 * every group and checks its rights in its own; without it, the router notes
 * where the bot was added, so the owner can copy the group's ID during setup.
 * Group IDs only, never a user ID.
 */
async function onMyMember(u: TgChatMemberUpdated, ctx: BotContext): Promise<void> {
  const chat = chatIdOf(u?.chat);
  if (chat === null || !isGroupChat(u.chat)) return;
  if (ctx.community) return ctx.community.onMyMember(u);
  if (!inChat(u.old_chat_member) && inChat(u.new_chat_member)) ctx.log?.(`added to group ${chat} (${u.chat.type})`);
}

/** One update from Telegram, answered through ctx.out (and the community agent's own calls). */
export async function handleUpdate(update: TgUpdate, ctx: BotContext): Promise<void> {
  if (update.message) return onMessage(update.message, ctx);
  if (update.callback_query) return onPress(update.callback_query, ctx);
  if (update.inline_query) return onInline(update.inline_query, ctx);
  if (update.edited_message) return onEdited(update.edited_message, ctx);
  if (update.chat_member) return onMember(update.chat_member, ctx);
  if (update.my_chat_member) return onMyMember(update.my_chat_member, ctx);
}
