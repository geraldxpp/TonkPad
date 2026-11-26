import type { Locale } from "@/shared/i18n/config";

/**
 * The community agent's shared types: who's who, what the rules and Haiku's
 * check find, and what moderation decides. The enum lists are values too, so
 * validators, schemas and dictionaries can walk them; they live only here,
 * and the split files (types-records.ts, types-admin.ts, re-exported below)
 * import types alone, so nothing loops at run time.
 */

export type ChatId = number;
export type UserId = number;

/** How hard a group is moderated; a group starts in TELEGRAM_COMMUNITY_MODE (observe by default). */
export const STRICTNESS_LEVELS = ["observe", "relaxed", "normal", "strict"] as const;
export type Strictness = (typeof STRICTNESS_LEVELS)[number];

/** Who wrote a message: from Telegram's admin list, an admin's trust, or the bot's newcomer record. */
export type Standing = "admin" | "trusted" | "new" | "member";

export const RULE_CATEGORIES = [
  "secret", "secret_probable", "lookalike", "phishing", "scam_report", "fake_support", "invite_link", "impersonation",
  "name_link", "newcomer_link", "unknown_link", "brand_forward", "contact_info", "risky_file", "flood", "link_raid",
  "edited_spam", "security_report", "abuse", "bot_added", "model_spam", "model_scam", "reported",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/** protect: a secret (delete, never an offence); notice: delete with a note; offence: the ladder; scam: delete and mute or ban; report: a scam report (no offence); alert: tell the admins. */
export type Severity = "protect" | "notice" | "offence" | "scam" | "report" | "alert";

export interface RuleHit {
  category: RuleCategory;
  severity: Severity;
  /** Rule-certain: only these can lead to a ban. */
  certain: boolean;
  /** English, written by code: never the member's text. */
  detail: string;
}

/** What the rules noticed in a message, for Haiku's check and the triggers. */
export interface Markers {
  question: boolean;
  /** Link domains, lower-cased. */
  domains: string[];
  /** Normalized links, handles and addresses, for the edit memory (mod/edits.ts). */
  linkKeys: string[];
  /** Risky links by host and path, for link raids (mod/rules-scan.ts); never a handle, a token address or a bot command's links. */
  raidKeys?: string[];
  unknownLinks: number;
  handles: number;
  addresses: string[];
  helpWords: boolean;
  dmWords: boolean;
  reportWords: boolean;
  crisis: "strong" | "weak" | null;
  words: number;
}

export interface RuleResult {
  hits: RuleHit[];
  markers: Markers;
}

/** Why a case needs a person. */
export const ESCALATIONS = [
  "lost_funds", "stuck_tx", "bug", "security", "legal", "press", "listing", "partnership", "distress", "crisis", "scam_report", "unsure",
] as const;
export type Escalation = (typeof ESCALATIONS)[number];

/** What Haiku's check sees: the cleaned, masked text and flags code works out; never IDs, names or usernames. */
export interface TriageInput {
  text: string;
  edited: boolean;
  forwarded: boolean;
  standing: "new" | "member" | "trusted";
  domains: string[];
  handles: number;
  addresses: number;
  replyToBot: boolean;
  appLang: Locale;
}

export const TRIAGE_CATEGORIES = [
  "none", "link_spam", "promo", "phishing", "seed_phrase", "fake_support", "impersonation", "dm_solicitation", "invite_link", "offensive", "other",
] as const;

/** Haiku's verdict, as its JSON schema asks (mod/triage.ts validates it). */
export interface TriageVerdict {
  verdict: "ok" | "spam" | "scam" | "unsure";
  category: (typeof TRIAGE_CATEGORIES)[number];
  question: "none" | "tonkfun" | "other";
  needs_human: Escalation | "none";
  dm_scam_mention: boolean;
  language: Locale | "other";
  /** One line, written by the model: shown to admins only, labelled "AI's guess". */
  reason: string;
}

export type ModAction =
  | { kind: "delete" }
  | { kind: "warn" }
  | { kind: "mute"; seconds: number }
  | { kind: "ban" }
  | { kind: "kick" }
  | { kind: "ban_sender_chat" };

export type NoticeKind =
  | "removed" | "warned" | "muted" | "banned" | "newcomer" | "contact"
  | "secret" | "secret_probable" | "dm_warning" | "scam_report" | "flaw" | "summary";

/** What happens to a message and its author. */
export interface Decision {
  actions: ModAction[];
  category: RuleCategory;
  source: "rule" | "model" | "report" | "admin";
  /**
   * The offence it records: none; "model" for every offence that isn't
   * rule-certain, whether from Haiku's verdict alone or from a rule hit with
   * certain false (a flood, a risky file, an edited-in link, a support
   * handle, an impersonating name); or "certain". Only a "certain" offence
   * can let the ladder ban.
   */
  offence: "none" | "model" | "certain";
  notice: NoticeKind | null;
  alert: AlertKind | null;
  /** Observe mode: only protective deletes act; the rest is reported. */
  observeOnly: boolean;
}

/** What the admin chat hears about. */
export const ALERT_KINDS = [
  ...ESCALATIONS,
  "report", "action", "observe", "preview", "raid", "budget", "rights", "secret", "digest", "appeal", "control", "setup", "refusals", "knowledge",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Each group's daily numbers (no IDs). */
export const COUNTER_KEYS = [
  "answers", "proactive", "private", "refused", "escalated", "removed", "warned", "muted",
  "banned", "kicked", "checked", "passed", "reports", "appeals", "crisis", "held",
] as const;
export type CounterKey = (typeof COUNTER_KEYS)[number];

/** Why every model call is off: an owner's /ai off, a billing problem, or a missing model or workspace. */
export const AI_OFF_REASONS = ["admin", "billing", "not_found"] as const;
export type AiOff = { reason: (typeof AI_OFF_REASONS)[number]; since: number };

/** The official accounts, never treated as impersonators or unknown links. */
export interface OfficialAccounts {
  /** The bot's usernames, without @. */
  bot: string[];
  channel: string | null;
  /** The community groups' usernames, without @. */
  groups: string[];
  /** The official X handles. */
  x: string[];
  /** The site's origin. */
  site: string;
}

/** Where members' links may point: hosts and their subdomains (lower case, Unicode form, no "www."), official Telegram names, official X handles. */
export interface AllowList {
  domains: string[];
  telegram: string[];
  x: string[];
}

export type { ChatSettings, OffenceRecord, PendingCheck, Records, SpendRecord } from "./types-records";
export type { AdminAlert, AdminInfo, AdminRight, Admins, AlertSink, CommunityHooks, Newcomers, RaidControl } from "./types-admin";
