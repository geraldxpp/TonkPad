import type { Lane } from "../claude/types";
import type { AiOff, ChatId, CounterKey, RuleCategory, Strictness, UserId } from "./types";

/** A group's settings, changed by its owners (and raid mode). */
export interface ChatSettings {
  /** AI answers paused here (/pause); moderation keeps running. */
  paused: boolean;
  /** Unprompted answers on (/proactive). */
  proactive: boolean;
  strictness: Strictness;
  /** Raid mode lasts until this time (ms); 0 when off. */
  raidUntil: number;
}

/**
 * A new member's check in progress, written as soon as they are restricted
 * for it, so a restart never loses them; kept until 5 minutes after its
 * deadline, when the newcomer's restriction ends: 15 minutes at most once
 * the check is posted, 45 in all when posting it was delayed.
 */
export interface PendingCheck {
  chat: ChatId;
  user: UserId;
  /** The check message, shared by everyone who joined within 20 seconds; 0 until it is posted. */
  messageId: number;
  joinMessageId: number | null;
  /** When the check times out (ms). Before it is posted: carried forward in 10-minute steps while the bot tries to post it (mod/newcomers-wait.ts), and, after a restart, when they are removed. */
  deadline: number;
  /** The number to tap on a hard check, or null for the one-button check. */
  target: number | null;
  tries: number;
}

/** A member's offences: they count until 7 days after the last. */
export interface OffenceRecord {
  n: number;
  /** How many were rule-certain: only then can the ladder end in a ban. */
  certain: number;
  /** When the last one was (ms); 0 when there are none. */
  last: number;
  category: RuleCategory | null;
}

/** The day's AI spending per lane (USD, no IDs), saved so a restart resets nothing. */
export interface SpendRecord {
  /** The UTC day, "YYYY-MM-DD". */
  day: string;
  lanes: Record<Lane, number>;
}

/**
 * The community's records on the worker's volume (community/records.ts):
 * numbers, enums and fingerprints only, never text, names or usernames.
 * Every change is persisted; prune(now) enforces the retention the privacy
 * page states.
 */
export interface Records {
  settings(chat: ChatId): ChatSettings;
  updateSettings(chat: ChatId, patch: Partial<ChatSettings>): void;

  /** Trusted members skip the newcomer and link rules; trust covers the name they had when trusted. */
  isTrusted(chat: ChatId, user: UserId): boolean;
  /** True only when trusted and the stored name fingerprint equals this one. */
  trustedName(chat: ChatId, user: UserId, nameHash: string): boolean;
  trust(chat: ChatId, user: UserId, nameHash: string, now: number): void;
  untrust(chat: ChatId, user: UserId): void;
  trusted(chat: ChatId): UserId[];

  /** A member in their first days after passing the check. */
  isNewcomer(chat: ChatId, user: UserId, now: number): boolean;
  markNewcomer(chat: ChatId, user: UserId, passedAt: number, until: number): void;
  /** When a newcomer joined or passed the check (ms), while their newcomer days last; else null. For the admins' alerts. */
  newcomerSince(chat: ChatId, user: UserId, now: number): number | null;

  /** Offences still counting (7 days after the last); an empty record when there are none. */
  offences(chat: ChatId, user: UserId, now: number): OffenceRecord;
  addOffence(chat: ChatId, user: UserId, now: number, category: RuleCategory, certain: boolean): OffenceRecord;
  /** Undoes the latest offence (an admin's Undo on a warning). */
  removeOffence(chat: ChatId, user: UserId): OffenceRecord;

  pending(chat: ChatId, user: UserId): PendingCheck | null;
  setPending(check: PendingCheck): void;
  dropPending(chat: ChatId, user: UserId): void;
  /** Everyone still pending on one shared check message. */
  pendingOn(chat: ChatId, messageId: number): PendingCheck[];
  /** Everyone pending in one group, posted or not. */
  pendingIn(chat: ChatId): PendingCheck[];
  /** Checks whose deadline has passed. */
  duePending(now: number): PendingCheck[];

  /** When this member last asked for a review here (kept a day), or null. */
  appealAt(chat: ChatId, user: UserId): number | null;
  markAppeal(chat: ChatId, user: UserId, now: number): void;

  /** The bot's own messages to delete later (notices, routine alerts), kept at most 48 hours. */
  scheduleDelete(chat: ChatId, messageId: number, due: number): void;
  dueDeletes(now: number): Array<{ chat: ChatId; messageId: number }>;
  doneDelete(chat: ChatId, messageId: number): void;

  /** Deletes every record of this member in this group (they left, or an owner's /forget). */
  forgetMember(chat: ChatId, user: UserId): void;
  /** Deletes every member's records (trusted members and checks included) in the groups `allowed` doesn't list; their settings and counters stay. */
  forgetChatsExcept(allowed: readonly ChatId[]): void;
  /** Deletes every member's records (trusted members and checks included) in one group the bot is no longer in; its settings and counters stay. */
  forgetChat(chat: ChatId): void;

  /** Adds to today's counter (UTC day). */
  count(chat: ChatId, key: CounterKey, now: number, n?: number): void;
  /** Today's counters, every key present. */
  counts(chat: ChatId, now: number): Record<CounterKey, number>;

  spend(): SpendRecord | null;
  setSpend(s: SpendRecord): void;
  /** The saved AI-off switch: an owner's /ai off, or a billing or not-found stop. */
  aiOff(): AiOff | null;
  setAiOff(v: AiOff | null): void;

  /** Drops whatever has outlived its retention. */
  prune(now: number): void;
}
