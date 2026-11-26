import { clip } from "../../text";
import { GROUP_GAP, PRIVATE_GAP, type Priority, type Sender } from "../sender";
import type { TgMessage } from "../types";
import type { CommunityOut, SendKind } from "./out";
import { createMemberActions } from "./telegram-out-actions";
import { createGroupBudget, type SlotKind } from "./telegram-out-budget";
import { createDeletes } from "./telegram-out-deletes";
import { createEphemeral } from "./telegram-out-ephemeral";
import { createReads } from "./telegram-out-reads";
import type { ChatId, Records } from "./types";

export interface TelegramOutDeps {
  sender: Sender;
  /** Where each delete is kept until Telegram confirms it, so a failure, a stop or a restart still makes it. */
  records: Records;
  /** The team's admin chat: its edits are alerts, and a send it refuses is checked for an upgrade to a supergroup. */
  adminChat: ChatId | null;
  /** Whether the admin chat passed its setup checks (always, unless given): until then nothing is sent or edited there. */
  adminReady?: () => boolean;
  /** Logs without text or user IDs. */
  log: (line: string) => void;
  now: () => number;
}

const HOUR = 3_600_000;
/** A send or edit goes out within this time of being asked for, or is dropped: the group's budget, its queue and Telegram's waits included. */
const MAX_WAIT_MS = 20_000;
const TIMEOUT_MS = 10_000;
/** A press answer goes out within this time or not at all: Telegram refuses a late one anyway, and the client's spinner stops by itself. */
const PRESS_WAIT_MS = 5_000;
/** Calls each kind may have waiting in one chat (a group's check edits as many as its checks); one person's private chat may have more answers waiting. */
const QUEUED: Readonly<Record<SendKind, number>> = { answer: 3, check: 6, notice: 6, alert: 20 };
const PRIVATE_ANSWERS = 10;
/** A callback answer's toast holds 200 characters. */
const TOAST_MAX = 200;
/** Telegram's words when a basic group's old ID is used after it became a supergroup (the answer carries migrate_to_chat_id). */
const MIGRATED = /upgraded to a supergroup/i;

const isGroup = (chat: ChatId) => chat < 0;
const validChat = (chat: unknown): chat is ChatId => typeof chat === "number" && Number.isSafeInteger(chat) && chat !== 0;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Where a send or edit waits: its queue (`<chat>:<name>`), its kind's share of the group's minute, and its place among the second's 25. */
interface Lane {
  name: string;
  slot: SlotKind;
  maxQueued: number;
  priority: Priority;
}

/**
 * Everything the community agent asks of Telegram, over the Sender. Sends
 * queue per chat and kind (`<chat>:<kind>`, a group's gap or a private
 * chat's apart) and share each group's minute (telegram-out-budget.ts): past
 * its share an answer or notice is dropped, a check or an alert waits for a
 * slot. A group's check edits have a queue of their own (`<chat>:edit`), a
 * smaller share they never wait for, and go after messages for the second's
 * 25, so a waiting check send always goes ahead of them. Each goes out within
 * 20 seconds or not at all; nothing goes to the admin chat before it passed
 * its checks. Deletes are batched and kept until confirmed
 * (telegram-out-deletes.ts); moderation calls go first of all
 * (telegram-out-actions.ts), then the reads (telegram-out-reads.ts; a join's
 * fresh read after messages), and a press answer last, within 5 seconds or
 * not at all. Nothing here throws: a
 * failure is null or false, logged by the Sender with Telegram's own words,
 * never with text.
 */
export function createTelegramOut(deps: TelegramOutDeps): CommunityOut & { tick(now: number): Promise<void>; stop(): void } {
  const { sender, log, now } = deps;
  const budget = createGroupBudget();
  const deletes = createDeletes({ sender, records: deps.records, now });
  let migratedAt = Number.NEGATIVE_INFINITY;

  /** The admin chat's old ID after an upgrade to a supergroup: alerts can't reach it until the owner sets the new one. Logged at most hourly. */
  function noteMigration(chat: ChatId): void {
    const at = now();
    if (chat !== deps.adminChat || !MIGRATED.test(sender.stats.lastError) || at - migratedAt < HOUR) return;
    migratedAt = at;
    log('the admin chat was upgraded to a supergroup and has a new ID, so alerts can\'t reach it: set TELEGRAM_ADMIN_CHAT_ID to the new -100… ID (remove the bot from the admin chat and add it again; the log then says "added to group …")');
  }

  const reads = createReads({ sender, now, noteMigration });
  const actions = createMemberActions({ sender, log, now, changed: reads.forget });
  const ephemeral = createEphemeral({ sender, budget, log, now });

  const maxQueued = (chat: ChatId, kind: SendKind) => (kind === "answer" && !isGroup(chat) ? PRIVATE_ANSWERS : QUEUED[kind]);
  const sendLane = (chat: ChatId, kind: SendKind): Lane => ({ name: kind, slot: kind, maxQueued: maxQueued(chat, kind), priority: "send" });
  /** The bot edits only its check messages in a group (cosmetic: they go last), and its alerts and panels in the admin chat. */
  function editLane(chat: ChatId): Lane {
    if (chat === deps.adminChat) return sendLane(chat, "alert");
    return isGroup(chat) ? { name: "edit", slot: "edit", maxQueued: QUEUED.check, priority: "edit" } : sendLane(chat, "answer");
  }
  /** The admin chat before it passed its checks: nothing goes there. */
  const held = (chat: ChatId) => chat === deps.adminChat && deps.adminReady?.() === false;

  /** A send or edit in its lane's queue, inside the group's minute. */
  async function queued<T>(chat: ChatId, lane: Lane, method: string, params: Record<string, unknown>): Promise<T | null> {
    const asked = now();
    const slot = isGroup(chat) ? budget.take(chat, lane.slot, asked, MAX_WAIT_MS) : asked;
    if (slot === null) return null;
    if (slot > asked) await sleep(slot - asked);
    const left = Math.max(0, MAX_WAIT_MS - (now() - asked));
    const gap = isGroup(chat) ? GROUP_GAP : PRIVATE_GAP;
    const limits = { maxQueued: lane.maxQueued, maxWaitMs: left, timeoutMs: TIMEOUT_MS, priority: lane.priority };
    const result = await sender.toChat<T>(`${chat}:${lane.name}`, gap, method, params, limits);
    if (result === null) {
      if (isGroup(chat)) budget.release(chat, slot);
      noteMigration(chat);
    }
    return result;
  }

  return {
    async send(chat, html, options) {
      if (!validChat(chat) || typeof html !== "string" || html === "" || held(chat)) return null;
      // Buttons, or else a reply field (the private Ask prompt): Telegram takes one reply_markup.
      const markup = options.keyboard ?? options.forceReply;
      const params: Record<string, unknown> = {
        chat_id: chat,
        text: html,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(markup ? { reply_markup: markup } : {}),
        ...(positive(options.replyTo) ? { reply_parameters: { message_id: options.replyTo, allow_sending_without_reply: true } } : {}),
        ...(positive(options.thread) ? { message_thread_id: options.thread } : {}),
      };
      // The message takes its slot in the group's minute first; the ephemeral copy only gets one if the minute is quiet. ephemeralOnly sends the copy alone (a group's only), never the message.
      const to = isGroup(chat) ? options.ephemeralTo : undefined;
      const sent = options.ephemeralOnly === true ? null : queued<TgMessage>(chat, sendLane(chat, options.kind), "sendMessage", params);
      if (to !== undefined) ephemeral.copy(chat, params, to);
      const id = (await sent)?.message_id;
      return positive(id) ? id : null;
    },

    async edit(chat, messageId, html, keyboard) {
      if (!validChat(chat) || !positive(messageId) || typeof html !== "string" || html === "" || held(chat)) return false;
      // Without reply_markup Telegram removes the message's buttons.
      const params = { chat_id: chat, message_id: messageId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(keyboard ? { reply_markup: keyboard } : {}) };
      return (await queued(chat, editLane(chat), "editMessageText", params)) !== null;
    },

    remove: (chat, messageIds) => deletes.remove(chat, messageIds),
    removeLater: (chat, messageId, afterMs) => deletes.removeLater(chat, messageId, afterMs),
    ...actions,
    admins: reads.admins,
    member: reads.member,
    chat: reads.chat,
    memberCount: reads.memberCount,
    forget: reads.forget,

    async typing(chat, thread) {
      if (!validChat(chat)) return;
      await sender.direct("sendChatAction", { chat_id: chat, action: "typing", ...(positive(thread) ? { message_thread_id: thread } : {}) });
    },

    async answerPress(callbackId, text) {
      if (typeof callbackId !== "string" || callbackId === "") return false;
      const params = { callback_query_id: callbackId, ...(text ? { text: clip(text, TOAST_MAX) } : {}) };
      return (await sender.direct("answerCallbackQuery", params, { priority: "press", maxWaitMs: PRESS_WAIT_MS })) !== null;
    },

    room(chat, kind) {
      if (!validChat(chat)) return false;
      return sender.waiting(`${chat}:${kind}`) < maxQueued(chat, kind) && (!isGroup(chat) || budget.room(chat, kind, now()));
    },

    async tick(at) {
      try {
        deletes.tick(at);
        budget.prune(at);
        reads.prune(at);
      } catch {
        log("telegram-out's tick failed");
      }
    },

    stop: () => deletes.stop(),
  };
}
