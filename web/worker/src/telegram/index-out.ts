import type { TokenStore } from "../store";
import { buysLast15m, toToken } from "../tokens";
import { HOT_BUYS, listView } from "../views/list";
import { findTrackedToken } from "../views/token";
import type { BotData, Out } from "./context";
import { GROUP_GAP, PRIVATE_GAP, type Sender } from "./sender";
import type { TgChat } from "./types";

/**
 * Module 14's side of telegram/index.ts: the worker's tokens as the bot
 * reads them, and where its answers go (the Sender, inside Telegram's limits).
 */

const EDIT_GAP = 250;
const isPrivate = (chat?: TgChat) => chat?.type === "private";

/**
 * A reply to a person: at most 10 waiting in a private chat, 3 in a group
 * (a group drains 20 a minute, so a busy one drops extras instead of holding
 * the bot up), sent within 20 s or dropped, each request 10 s at most.
 */
const replyLimits = (chat?: TgChat) => ({ maxQueued: isPrivate(chat) ? 10 : 3, maxWaitMs: 20_000, timeoutMs: 10_000 });

/** The worker's tokens as the bot reads them: never marking one opened, so no Helius credits are spent. */
export function storeData(store: TokenStore, now: () => number): BotData {
  return {
    ready: () => store.size > 0,
    token: (address) => {
      const t = findTrackedToken(store.all(), address);
      return t ? toToken(t, now(), buysLast15m(t, now()) >= HOT_BUYS) : null;
    },
    latest: (pad, limit) =>
      store.all().filter((t) => t.launchpad === pad).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((t) => toToken(t, now())),
    trending: (limit) => listView(store.all(), { chain: "all", pad: "all", tab: "trending", tf: "24h", q: "", limit }, now()).rows,
  };
}

/** Answers through the Sender: HTML, link previews off, in the message's forum topic when it has one. */
export function senderOut(sender: Sender): Out {
  return {
    async send(chat, view, replyTo, thread) {
      await sender.toChat(String(chat.id), isPrivate(chat) ? PRIVATE_GAP : GROUP_GAP, "sendMessage", {
        chat_id: chat.id,
        text: view.text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: view.forceReply ?? view.keyboard,
        ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
        ...(thread !== undefined && Number.isSafeInteger(thread) && thread > 0 ? { message_thread_id: thread } : {}),
      }, replyLimits(chat));
    },
    async edit(target, view, chat) {
      const where = "inlineId" in target ? { inline_message_id: target.inlineId } : { chat_id: target.chatId, message_id: target.messageId };
      const key = "inlineId" in target ? `inline:${target.inlineId}` : String(target.chatId);
      const gap = chat && !isPrivate(chat) ? GROUP_GAP : EDIT_GAP;
      await sender.toChat(key, gap, "editMessageText", { ...where, text: view.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: view.keyboard }, replyLimits(chat));
    },
    async answer(id, text) {
      return (await sender.direct("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) })) !== null;
    },
    async inline(id, results, button) {
      // Personal: each card is in the asker's own language, so Telegram mustn't hand one person's answer to another.
      await sender.direct("answerInlineQuery", { inline_query_id: id, results, cache_time: 10, is_personal: true, button: { text: button, start_parameter: "help" } });
    },
  };
}
