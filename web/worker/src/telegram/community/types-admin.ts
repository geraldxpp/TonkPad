import type { TgCallbackQuery, TgChatMemberUpdated, TgMessage, TgUpdate, TgUser } from "../types";
import type { AlertKind, ChatId, Escalation, RuleCategory, UserId } from "./types";

/**
 * An alert for the team's admin chat, built only from facts code knows. The
 * text is written from the bot's own words; member text appears only as a
 * short cleaned excerpt, never for a secret or a flaw report.
 */
export interface AdminAlert {
  /** The community group it is about, or null (budget, setup, a private chat's share). */
  chat: ChatId | null;
  kind: AlertKind;
  category: RuleCategory | Escalation | null;
  member: { id: UserId | null; name: string; username: string | null; since: number | null } | null;
  /** Who sent a group /report, shown on a line of its own; `member` is the person reported. */
  reporter?: { id: UserId | null; name: string; username: string | null } | null;
  /** A review's current restriction in the group, as getChatMember gave it. */
  standing?: "none" | "muted" | "restricted" | "removed" | null;
  excerpt: string | null;
  /** A link to the message (t.me/c/… or t.me/<group>/…), or null. */
  link: string | null;
  /**
   * What the bot did, then what it leaves to the admins: only the bot's own
   * words, drawn escaped but not cleaned, so any name or title in it is
   * cleaned with plainText by its producer. A reporter's reason goes in
   * reason, a proposed answer in preview.
   */
  done: string | null;
  /** The reason a reporter gave, in their own words (cleaned like an excerpt), shown with its own label; never in done. */
  reason?: string | null;
  /** The answer the bot would have given, in observe mode (model text, cleaned), shown with its own label; never in done. */
  preview?: string | null;
  /** Haiku's one-line reason, shown last and labelled "AI's guess". */
  aiGuess: string | null;
  /** Which Undo button the alert offers. */
  undo: "warn" | "mute" | "ban" | null;
  messageId: number | null;
  /** Routine alerts are deleted after 47 hours; cases that need a person stay for the chat's own timer. */
  routine: boolean;
  /** A member at risk: marked first. */
  urgent: boolean;
}

export interface AlertSink {
  alert(a: AdminAlert): void;
}

/** One of a group's admins, from getChatAdministrators. */
export interface AdminInfo {
  id: UserId;
  name: string;
  username: string | null;
  creator: boolean;
  anonymous: boolean;
  canDelete: boolean;
  canRestrict: boolean;
}

/** What an action through the bot needs: any admin, Delete messages, Ban users, or an owner. */
export type AdminRight = "any" | "delete" | "restrict" | "owner";

/** Each group's admins, read from Telegram every 10 minutes (community/admins.ts). */
export interface Admins {
  list(chat: ChatId): readonly AdminInfo[];
  isAdmin(chat: ChatId, user: UserId): boolean;
  /** Whether this person holds the right in this group now; anonymous admins never pass. */
  can(chat: ChatId, user: UserId, right: AdminRight, now: number): Promise<boolean>;
  /** The bot's own rights there, or null when Telegram can't say. */
  botRights(chat: ChatId): Promise<{ delete: boolean; restrict: boolean } | null>;
  /** Reads the list again (at most once a minute per group). */
  refresh(chat: ChatId, now: number): Promise<void>;
  /** Forgets one admin at once: a promotion or demotion was seen. */
  drop(chat: ChatId, user: UserId): void;
}

/** The new-member check (mod/newcomers.ts). */
export interface Newcomers {
  onJoin(chat: ChatId, users: readonly TgUser[], adder: TgUser | null, joinMessageId: number | null, date: number, now: number): Promise<void>;
  /** A press on a check (h:…); true when it was one. */
  onPress(q: TgCallbackQuery, now: number): Promise<boolean>;
  onLeave(chat: ChatId, user: UserId): void;
  /** Times out checks past their deadline, restored ones included. */
  tick(now: number): Promise<void>;
}

export interface RaidControl {
  active(chat: ChatId, now: number): boolean;
  start(chat: ChatId, reason: string, now: number): void;
  end(chat: ChatId, now: number): void;
}

/**
 * What the router hands the community agent (community/index.ts). Messages,
 * edits, member updates and presses from chats it doesn't own never reach
 * it; private chats reach it only through the private calls below.
 */
export interface CommunityHooks {
  /** An allow-listed community group. */
  owns(chat: ChatId): boolean;
  isAdminChat(chat: ChatId): boolean;
  /** Updates the poller buffers instead of dropping when busy. */
  priority(u: TgUpdate): boolean;
  /** A message in an owned group or the admin chat; "pass" leaves it to module 14 (/check, /help). Stale ones get the certain rules only. */
  onMessage(m: TgMessage, stale: boolean): Promise<"handled" | "pass">;
  onEdited(m: TgMessage): Promise<void>;
  onMember(u: TgChatMemberUpdated): Promise<void>;
  onMyMember(u: TgChatMemberUpdated): Promise<void>;
  /** A press already checked with pressMatches; true when the community handled it. */
  onPress(q: TgCallbackQuery): Promise<boolean>;
  /** /ask, or a reply to the Ask prompt, in a private chat: answered at once. */
  askPrivate(m: TgMessage, question: string): Promise<boolean>;
  /** Other private text: held in memory, with an Ask button; nothing is sent until it's tapped. */
  offerPrivate(m: TgMessage, text: string): Promise<boolean>;
  /** /report in a private chat: shared with the team by the member's choice. */
  reportPrivate(m: TgMessage, text: string): Promise<boolean>;
  /** /start with an argument the community owns (appeal). */
  startPrivate(m: TgMessage, arg: string): Promise<boolean>;
  aiOn(): boolean;
  /** Whether AI answers can run in the community groups now (aiOn is about private chats); absent means as aiOn. */
  groupAi?(): boolean;
  /** For the public /health: only { enabled }; details are in /status. */
  health(): Record<string, unknown>;
  save(): Promise<void>;
  stop(): void;
}
