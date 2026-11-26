import type { TgChat, TgUser } from "./types";

/**
 * Telegram's membership types (re-exported from types.ts): what a member may
 * do, who they are in a chat, and changes to that. Untrusted like every
 * update: each field is checked where it is read.
 */

/** What a member may do (restrictChatMember, the group's defaults): the 16 fields of ChatPermissions. */
export interface TgChatPermissions {
  can_send_messages?: boolean;
  can_send_audios?: boolean;
  can_send_documents?: boolean;
  can_send_photos?: boolean;
  can_send_videos?: boolean;
  can_send_video_notes?: boolean;
  can_send_voice_notes?: boolean;
  can_send_polls?: boolean;
  can_send_other_messages?: boolean;
  can_add_web_page_previews?: boolean;
  can_react_to_messages?: boolean;
  can_edit_tag?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
}

/**
 * A member's place in a chat (getChatMember, getChatAdministrators,
 * chat_member updates). A restricted member also carries the permission
 * fields; an administrator its rights.
 */
export interface TgChatMember extends TgChatPermissions {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TgUser;
  /** A restricted member: whether they are still in the chat. */
  is_member?: boolean;
  /** An admin hidden behind the group's name: their messages come with sender_chat set to the group. */
  is_anonymous?: boolean;
  can_delete_messages?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  /** A restricted or kicked member: when it ends (unix seconds; 0 means never). */
  until_date?: number;
}

/** A change to someone's membership (chat_member), or to the bot's own (my_chat_member). */
export interface TgChatMemberUpdated {
  chat: TgChat;
  /** Who made the change: the member themselves when they join or leave. */
  from: TgUser;
  date: number;
  old_chat_member: TgChatMember;
  new_chat_member: TgChatMember;
  via_join_request?: boolean;
}

/** What getChat returns, as far as the bot reads it. */
export interface TgChatFull {
  id: number;
  type: TgChat["type"];
  title?: string;
  username?: string;
  /** The group's default permissions for members. */
  permissions?: TgChatPermissions;
  /** A channel's discussion group, or a discussion group's channel. */
  linked_chat_id?: number;
}
