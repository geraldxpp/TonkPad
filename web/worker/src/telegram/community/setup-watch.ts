import type { TgChatFull } from "../types";
import { fillText } from "./controls-people";
import type { CommunityOut } from "./out";
import type { AdminAlert, AlertSink, ChatId } from "./types";
import type { CommunityDictionary } from "./words";

/** The admin chat's member count is read this often. */
const WATCH_MS = 10 * 60_000;
/** Its auto-delete timer is read this often. */
const AUTO_DELETE_MS = 60 * 60_000;
/** Telegram's auto-delete timer may be at most a week: the privacy page says the admin chat deletes everything after 7 days. */
const WEEK_S = 7 * 24 * 60 * 60;

/** The admin chat's auto-delete timer: a week or less, missing or longer ("long"), or unknown. */
export type AutoDelete = "ok" | "long" | null;

/** A setup problem for the team: it needs a person, so it stays for the chat's own timer. */
export const setupAlert = (chat: ChatId | null, kind: "setup" | "rights", done: string): AdminAlert => ({
  chat, kind, category: null, member: null, excerpt: null, link: null, done, aiGuess: null, undo: null, messageId: null, routine: false, urgent: false,
});

/** The auto-delete timer getChat shows (message_auto_delete_time, seconds; missing when off). */
export function autoDeleteOf(chat: TgChatFull): Exclude<AutoDelete, null> {
  const seconds = (chat as TgChatFull & { message_auto_delete_time?: unknown }).message_auto_delete_time;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= WEEK_S ? "ok" : "long";
}

export interface AdminChatWatchDeps {
  out: CommunityOut;
  adminChat: ChatId;
  alerts: AlertSink;
  words: CommunityDictionary;
  /** The auto-delete timer as the setup checks found it (already alerted when "long"), or null when they couldn't read it. */
  autoDelete?: AutoDelete;
  /** Whether the admin chat passed its checks (always, unless given): until then nothing is read, so no alert waits at the gate. */
  ready?: () => boolean;
}

export interface AdminChatWatch {
  tick(now: number): Promise<void>;
  /** The timer as read elsewhere (the setup checks, run again): one alert when it turned long. */
  sawAutoDelete(value: Exclude<AutoDelete, null>): void;
}

/**
 * The admin chat, watched (prompts/15-community-agent.md, Setup checks).
 * Every 10 minutes its member count: anyone who joins the team's chat sees
 * every alert, so a change is one alert with the new count (the first read
 * only sets it). Every hour its auto-delete timer: a timer turned off or set
 * longer than a week is one alert, once per change. Nothing is read before
 * the admin chat passed its checks. A failed read is tried again at the
 * next turn. tick() never rejects.
 */
export function createAdminChatWatch(deps: AdminChatWatchDeps): AdminChatWatch {
  let known: number | null = null;
  let readAt = Number.NEGATIVE_INFINITY;
  let autoDelete: AutoDelete = deps.autoDelete ?? null;
  /** Read at the first tick when the setup checks couldn't; else an hour after it. */
  let autoAt: number | null = autoDelete === null ? Number.NEGATIVE_INFINITY : null;
  let reading = false;

  function saw(value: Exclude<AutoDelete, null>): void {
    if (value === "long" && autoDelete !== "long") deps.alerts.alert(setupAlert(null, "setup", deps.words.admin.setup.autoDelete));
    autoDelete = value;
  }

  async function count(): Promise<void> {
    const n = await deps.out.memberCount(deps.adminChat);
    if (n === null) return;
    if (known !== null && n !== known) deps.alerts.alert(setupAlert(null, "setup", fillText(deps.words.admin.setup.members, { count: String(n) })));
    known = n;
  }

  async function timer(): Promise<void> {
    const chat = await deps.out.chat(deps.adminChat);
    if (chat) saw(autoDeleteOf(chat));
  }

  return {
    async tick(now) {
      if (reading || deps.ready?.() === false) return;
      reading = true;
      autoAt ??= now;
      try {
        if (now - readAt >= WATCH_MS) {
          readAt = now;
          await count().catch(() => undefined);
        }
        if (now - autoAt >= AUTO_DELETE_MS) {
          autoAt = now;
          await timer().catch(() => undefined);
        }
      } finally {
        reading = false;
      }
    },
    sawAutoDelete: saw,
  };
}
