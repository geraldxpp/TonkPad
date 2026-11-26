import type { Lane } from "../claude/types";
import type { AlertKind, CounterKey, Escalation, RuleCategory, Strictness } from "./types";

/**
 * The shape of the community's words; each language's values are in
 * i18n/community/<lang>.ts. Every field is a string the bot writes itself,
 * and button labels stay within 30 characters.
 *
 * Placeholders: a string holds exactly the {placeholders} named for it below
 * (none when none are named), and code fills each one with a value that is
 * already safe HTML. {duration} is a duration code writes with the plural
 * forms (mod.minutes, mod.hours, mod.days: "5 minutes"); a bare {count} is
 * phrased so any number reads right ("and {count} more").
 */

type Strings<K extends string> = Record<K, string>;

/** "{count} minutes", by the language's plural forms (like channel.days in module 14). */
export interface Plural {
  one: string;
  few: string;
  many: string;
  other: string;
}

export type LinkWord = "docs" | "launch" | "explore" | "swap" | "bridge" | "portfolio" | "security" | "privacy" | "launches" | "referral" | "token";

export type AdminButton =
  | "open"
  | "undo"
  | "unmute"
  | "unban"
  | "ban"
  | "trust"
  | "delete"
  | "mute"
  | "handled"
  | "endRaid"
  | "pause"
  | "resume"
  | "proactiveOn"
  | "proactiveOff"
  | "raidOn"
  | "raidOff"
  | "aiOn"
  | "aiOff";

export interface CommunityDictionary {
  /** Command menu descriptions (at most 256 characters): /ask, /rules and /report for members; the admin commands for each group's admins; /ai in the admin chat. */
  commands: Strings<"ask" | "rules" | "report" | "status" | "pause" | "resume" | "proactive" | "strict" | "raid" | "trust" | "untrust" | "trusted" | "forget" | "mod" | "ai">;
  /**
   * /help additions: how to ask in a private chat (ask) and a group
   * (groupAsk), that answers come from AI (ai), and the Privacy button
   * (privacy). While inline mode is on, ask and groupAsk name its Ask
   * result too: {bot} is the bot's @username and {button} the result's title
   * (module 14's inline.ask); askNoInline and groupAskNoInline say the same
   * without it.
   */
  help: Strings<"ask" | "askNoInline" | "ai" | "groupAsk" | "groupAskNoInline" | "privacy">;
  /**
   * An answer's label (its first line) and the fixed replies around it.
   * footer is no longer shown (the owner's call, 26 Nov 2026): it stays only
   * so a reply to an answer sent before then still drops that last line.
   * scoreLine: {score} and {level}. askButton and shareButton are
   * buttons; askPrompt is a private chat's reply prompt; askPlaceholder is at
   * most 64 characters. askLost answers inline mode's Ask post whose
   * question never came (inline-pending.ts).
   */
  answer: Strings<
    | "label"
    | "footer"
    | "busy"
    | "paused"
    | "tooLong"
    | "unsure"
    | "refused"
    | "cooldown"
    | "textOnly"
    | "escalated"
    | "shareAsk"
    | "shareButton"
    | "shared"
    | "flaw"
    | "business"
    | "unverifiedAddress"
    | "scoreLine"
    | "askOffer"
    | "askButton"
    | "askPrompt"
    | "askPlaceholder"
    | "askExpired"
    | "askLost"
  >;
  /** The human-written reply to someone at risk, and its helpline button. */
  crisis: Strings<"body" | "button">;
  /** Link button labels. */
  links: Strings<LinkWord>;
  /** Fixed warnings, never the model's words: the DM-scam warning, the scam-report reply, the secret notes (group and private), the contact-info and risky-file notes. */
  safety: Strings<"dmWarning" | "scamReport" | "secret" | "secretProbable" | "secretPrivate" | "contact" | "file">;
  /**
   * The new-member check. prompt: {mentions} and {duration} (the time to
   * pass). choose: {target} (the number to tap). welcome: {mentions}.
   * member: the fixed word each mention links. others: {count} (after three
   * mentions). button is a button; notYou, wrong, passed and retry are toasts.
   */
  check: Strings<"prompt" | "button" | "choose" | "notYou" | "wrong" | "passed" | "welcome" | "member" | "others" | "retry">;
  /**
   * Public notices, which never print a name. removed, warned and banned:
   * {mentions} and {reason}; muted: {mentions}, {duration} and {reason};
   * linkRemoved and newcomer: {mentions}. summary (raid mode): {count}. why:
   * the review button. reasons: one line per rule. minutes, hours and days:
   * {count}.
   */
  mod: Strings<"removed" | "linkRemoved" | "warned" | "muted" | "banned" | "newcomer" | "summary" | "why"> & {
    reasons: Record<RuleCategory, string>;
    minutes: Plural;
    hours: Plural;
    days: Plural;
  };
  /** The group notices when raid mode starts and ends. */
  raid: Strings<"on" | "off">;
  /** /rules: a title, then one line each. */
  rules: Strings<"title" | "ai" | "spam" | "links" | "dm" | "advice" | "report">;
  /** /report: how to use it in a group (usage, as a reply) and in a private chat (usagePrivate, with text), the thanks (group and private), no admin chat set up, and too many reports. */
  report: Strings<"usage" | "usagePrivate" | "thanks" | "thanksPrivate" | "noAdminChat" | "slowDown">;
  /**
   * A review request (t.me/<bot>?start=appeal). none, muted, removed and
   * restricted: {group}, one line per group. reason: {reason}. ask is the
   * button; intro, sent and once take nothing.
   */
  appeal: Strings<"intro" | "none" | "muted" | "removed" | "restricted" | "reason" | "ask" | "sent" | "once">;
  /** /id: the words before the person's own ID. */
  id: Strings<"yours">;
  /**
   * The admin chat: refusals, alert labels and buttons, the /mod panel and
   * /status. handledBy: {admin}. confirm: {admin} and {group}, strictness
   * also {level}, but aiOn and aiOff {admin} only. budget: warn {spent} and
   * {cap}, lane {lane} (its word from lanes), cap {cap}. rights: {group}.
   * setup: owner {group}, members {count}.
   *
   * These take no placeholders: noRight, the toast for a press without the
   * admin right it needs; isAdmin, the toast for Trust, Ban, Unmute or Mute
   * 1 h pressed on an alert about an administrator (Telegram restricts and
   * bans none the bot didn't promote); reportedBy, the label before who sent a /report;
   * standing, a review's current restriction; byHand (a message too old for
   * the bot to delete), olderMessages (after a scam ban) and checkFailed (a
   * check that couldn't be posted), each added after what the bot did;
   * budget.notFound (Anthropic can't find the model or the key's
   * workspace); and /status's labels: counters for each of the day's
   * numbers, lanes for each budget lane and status.queues for work waiting.
   * Also without placeholders: reportReason, the label before the reason a
   * reporter gave (their own words); preview, the label before an answer the
   * bot would have given in observe mode; budget.auth (Anthropic refused the
   * key), budget.badRequest (a request rejected as malformed) and budget.ramp
   * (Anthropic asked the bot to slow down); setup.autoDelete (the admin
   * chat's one-week auto-delete is off). more: {count}, after a digest's
   * last item ("and 3 more"). budget.circuitChecks and circuitAnswers,
   * badRequestChecks and badRequestAnswers, backChecks and backAnswers: the
   * same stops and returns for one kind of call (checks or answers), no
   * placeholders.
   */
  admin: Strings<
    | "onlyOwners"
    | "anonymous"
    | "noRight"
    | "isAdmin"
    | "member"
    | "newMember"
    | "reportedBy"
    | "reportReason"
    | "preview"
    | "more"
    | "excerpt"
    | "aiGuess"
    | "done"
    | "byHand"
    | "olderMessages"
    | "checkFailed"
    | "handledBy"
    | "neverDm"
  > & {
    kinds: Record<AlertKind, string>;
    categories: Record<RuleCategory | Escalation, string>;
    buttons: Strings<AdminButton>;
    levels: Record<Strictness, string>;
    standing: Record<"none" | "muted" | "restricted" | "removed", string>;
    counters: Record<CounterKey, string>;
    lanes: Record<Lane, string>;
    status: Strings<"title" | "answers" | "moderation" | "members" | "budget" | "mode" | "knowledge" | "rights" | "queues">;
    confirm: Strings<"paused" | "resumed" | "proactiveOn" | "proactiveOff" | "strictness" | "raidOn" | "raidOff" | "trusted" | "untrusted" | "forgotten" | "aiOn" | "aiOff" | "noReply">;
    budget: Strings<"warn" | "lane" | "cap" | "circuit" | "circuitChecks" | "circuitAnswers" | "billing" | "notFound" | "auth" | "badRequest" | "badRequestChecks" | "badRequestAnswers" | "ramp" | "restored" | "backChecks" | "backAnswers">;
    rights: Strings<"missing" | "removed">;
    setup: Strings<"owner" | "adminChatPublic" | "contact" | "members" | "autoDelete">;
    knowledge: Strings<"stale">;
  };
}
