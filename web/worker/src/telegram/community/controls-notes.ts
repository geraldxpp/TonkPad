import { escapeHtml, plainText } from "../text";
import type { TgMessage, View } from "../types";
import { fillText, ROUTINE_MS, topicOf } from "./controls-people";
import type { CommunityOut } from "./out";
import type { AdminAlert, AlertSink, ChatId } from "./types";
import type { CommunityDictionary } from "./words";

export type ConfirmKey = keyof CommunityDictionary["admin"]["confirm"];

/** A filled value at most this long: a name and a username, or a group's title. */
const VALUE_MAX = 100;

export interface AdminChatNotes {
  /** A note through the alerts: kind control, routine (deleted after 47 hours). `done` is the bot's own words as plain text; the alerts only escape it. */
  note(chat: ChatId | null, done: string, member?: AdminAlert["member"]): void;
  /** A change confirmed with who made it (admin.confirm), each value (a name, a group's title) cleaned first, since the alerts take the line as the bot's own words. */
  confirm(chat: ChatId | null, key: ConfirmKey, values: Readonly<Record<string, string>>, member?: AdminAlert["member"]): void;
  /** A view of the bot's own HTML (a status, a panel, a list) sent to the admin chat, deleted after 47 hours. */
  post(view: View, options?: { thread?: number; replyTo?: number }): Promise<void>;
  /** A short reply to a command in the admin chat, in its topic. */
  answer(m: TgMessage, text: string): Promise<void>;
}

/** What the controls say in the team's admin chat. */
export function adminChatNotes(deps: { out: CommunityOut; alerts: AlertSink; adminChat: ChatId; adminWords: CommunityDictionary }): AdminChatNotes {
  const { out, alerts, adminChat, adminWords: w } = deps;

  const note: AdminChatNotes["note"] = (chat, done, member = null) =>
    alerts.alert({ chat, kind: "control", category: null, member, excerpt: null, link: null, done, aiGuess: null, undo: null, messageId: null, routine: true, urgent: false });

  const post: AdminChatNotes["post"] = async (view, options = {}) => {
    const id = await out.send(adminChat, view.text, { kind: "alert", ...options, keyboard: view.keyboard });
    if (id !== null) out.removeLater(adminChat, id, ROUTINE_MS);
  };

  return {
    note,
    confirm: (chat, key, values, member = null) => {
      // A name or a title can carry a link, a handle or a command: cleaned, so the line holds nothing live.
      const clean = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, plainText(value, VALUE_MAX)]));
      note(chat, fillText(w.admin.confirm[key], clean), member);
    },
    post,
    answer: (m, text) => post({ text: escapeHtml(text) }, { thread: topicOf(m), replyTo: m.message_id }),
  };
}
