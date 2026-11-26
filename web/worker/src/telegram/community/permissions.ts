import type { TgChatPermissions } from "../types";

/**
 * The permission sets the bot gives with restrictChatMember (always with
 * use_independent_chat_permissions), each naming all 16 fields so Telegram
 * reads nothing into a missing one. Frozen: they are shared by every caller.
 */
function every(value: boolean): Required<TgChatPermissions> {
  return {
    can_send_messages: value,
    can_send_audios: value,
    can_send_documents: value,
    can_send_photos: value,
    can_send_videos: value,
    can_send_video_notes: value,
    can_send_voice_notes: value,
    can_send_polls: value,
    can_send_other_messages: value,
    can_add_web_page_previews: value,
    can_react_to_messages: value,
    can_edit_tag: value,
    can_change_info: value,
    can_invite_users: value,
    can_pin_messages: value,
    can_manage_topics: value,
  };
}

/** A mute, or a newcomer waiting for the check: nothing at all. */
export const MUTED: Readonly<Required<TgChatPermissions>> = Object.freeze(every(false));

/** A newcomer who passed the check, for their first days: text and reactions only (no media, polls, stickers or link previews). */
export const TEXT_ONLY: Readonly<Required<TgChatPermissions>> = Object.freeze({ ...every(false), can_send_messages: true, can_react_to_messages: true });

/**
 * Lifts a restriction: every permission true, Telegram's documented way. The
 * group's own defaults still apply on top.
 */
export const LIFTED: Readonly<Required<TgChatPermissions>> = Object.freeze(every(true));
