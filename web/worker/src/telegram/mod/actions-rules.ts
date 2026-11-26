import type { Decision, ModAction, NoticeKind, OffenceRecord, RuleCategory, RuleHit } from "../community/types";
import type { DecideContext } from "./actions-decide";
import { DAY_S, ladderStep } from "./ladder";

/**
 * The rules' own decision for one hit (prompts/15-community-agent.md, The
 * rules and Strictness): what each category does, by the member's standing
 * and the group's strictness. Pure.
 */

export type Draft = Pick<Decision, "actions" | "offence" | "notice" | "alert">;

export const DEL: ModAction = { kind: "delete" };
const WEEK_S = 7 * DAY_S;
const FLOOD_S = 600;

/** Which hit leads when a message has several: the earliest category here. */
const PRIORITY: readonly RuleCategory[] = [
  "secret", "secret_probable", "security_report", "bot_added", "name_link", "impersonation", "scam_report",
  "link_raid", "lookalike", "phishing", "fake_support", "flood", "invite_link", "risky_file", "edited_spam",
  "newcomer_link", "abuse", "unknown_link", "brand_forward", "contact_info", "model_scam", "model_spam", "reported",
];

export function lead(hits: readonly RuleHit[]): RuleHit | null {
  const rank = (h: RuleHit) => (PRIORITY.includes(h.category) ? PRIORITY.indexOf(h.category) : PRIORITY.length);
  return hits.reduce<RuleHit | null>((best, h) => (best === null || rank(h) < rank(best) ? h : best), null);
}

/** The record once this offence counts too. */
export const after = (o: OffenceRecord, certain: boolean): OffenceRecord => ({ ...o, n: o.n + 1, certain: o.certain + (certain ? 1 : 0) });
/** "model" stands for every offence that isn't rule-certain (Haiku's alone, a flood, a file): none of them can lead to a ban by itself. */
const offenceOf = (hit: RuleHit): Decision["offence"] => (hit.certain ? "certain" : "model");
export const noticeFor = (a: ModAction): NoticeKind => (a.kind === "ban" || a.kind === "kick" ? "banned" : a.kind === "mute" ? "muted" : "warned");
/** How hard a sanction bites, in seconds: a ban or a removal never ends. */
const bite = (a: ModAction): number => (a.kind === "ban" || a.kind === "kick" ? Number.POSITIVE_INFINITY : a.kind === "mute" ? a.seconds : 0);
export const strongest = (actions: readonly ModAction[]): number => Math.max(0, ...actions.map(bite));

/** An offence on the ladder: delete, then its step. `floor` is the least it does (a flood's 10-minute mute). */
function ladder(hit: RuleHit, ctx: DecideContext, floor: ModAction | null = null): Draft {
  const step = ladderStep(ctx.strictness, after(ctx.offences, hit.certain));
  const sanction = floor && bite(floor) > bite(step) ? floor : step;
  return { actions: [DEL, sanction], offence: offenceOf(hit), notice: noticeFor(sanction), alert: "action" };
}

/** A note the first time (recorded, so the next one counts), the ladder after. */
function firstNote(hit: RuleHit, ctx: DecideContext, notice: NoticeKind): Draft {
  if (ctx.offences.n > 0) return ladder(hit, ctx);
  return { actions: [DEL], offence: offenceOf(hit), notice, alert: "action" };
}

/** A scam: delete; a new member is banned when the rule is certain, anyone else muted 24 h. */
function scam(hit: RuleHit, ctx: DecideContext): Draft {
  const sanction: ModAction = ctx.standing === "new" && hit.certain ? { kind: "ban" } : { kind: "mute", seconds: DAY_S };
  return { actions: [DEL, sanction], offence: offenceOf(hit), notice: noticeFor(sanction), alert: "action" };
}

/**
 * A member's unknown link (or a forward from a brand-named chat), by
 * strictness; observe reports what normal does. Every removal reaches the
 * team as a routine action alert (the privacy page says each action does).
 * Relaxed mode keeps both up outside a raid: a link for Haiku's check (held
 * when the check can't read it), and with the team told, a brand forward
 * (which carries no unknown link when it leads, so may never reach the
 * check) and the bot's own words (which never do: ctx.own).
 */
function unknownLink(hit: RuleHit, ctx: DecideContext): Draft | null {
  const note: Draft = { actions: [DEL], offence: "none", notice: "removed", alert: "action" };
  if (ctx.strictness === "strict") return firstNote(hit, ctx, "removed");
  // Haiku's check skips link messages in a raid: then relaxed mode removes them too.
  if (ctx.strictness === "relaxed" && !ctx.raid) return hit.category === "brand_forward" || ctx.own === true ? { actions: [], offence: "none", notice: null, alert: "action" } : null;
  // Normal: removed with a note; Haiku's verdict decides the offence.
  return note;
}

/**
 * A copy of a raided link: a raider who is a new member is banned (the
 * rule is certain); anyone else's copy is only deleted, as an unknown link
 * would be, with no offence, so sharing a link nobody else may can never
 * mute or ban a member, nor be aimed at one.
 */
function linkRaid(hit: RuleHit, ctx: DecideContext): Draft {
  if (ctx.standing === "new" && hit.certain && !ctx.senderChat) return { actions: [DEL, { kind: "ban" }], offence: "certain", notice: "banned", alert: "action" };
  return { actions: [DEL], offence: "none", notice: "removed", alert: "action" };
}

/** Anything else, by the severity its rule gave it. */
function bySeverity(hit: RuleHit, ctx: DecideContext): Draft | null {
  switch (hit.severity) {
    case "protect":
      return { actions: [DEL], offence: "none", notice: "secret", alert: "secret" };
    case "scam":
      return scam(hit, ctx);
    case "offence":
      return ladder(hit, ctx);
    case "notice":
      return { actions: [DEL], offence: "none", notice: "removed", alert: "action" };
    case "report":
      return { actions: [], offence: "none", notice: "scam_report", alert: "scam_report" };
    case "alert":
      return { actions: [], offence: "none", notice: null, alert: "action" };
  }
}

export function byRule(hit: RuleHit, ctx: DecideContext): Draft | null {
  switch (hit.category) {
    case "secret":
    case "secret_probable":
      return { actions: [DEL], offence: "none", notice: hit.category, alert: "secret" };
    case "security_report":
      return { actions: [DEL], offence: "none", notice: "flaw", alert: "security" };
    case "bot_added":
      return { actions: [{ kind: "ban" }], offence: "none", notice: null, alert: "action" };
    case "name_link":
      return { actions: [DEL, { kind: "kick" }], offence: "none", notice: "banned", alert: "action" };
    case "impersonation":
      // Never banned automatically: a week's mute, and admins decide (Ban, Unmute, Trust).
      return { actions: [DEL, { kind: "mute", seconds: WEEK_S }], offence: "model", notice: "muted", alert: "action" };
    case "scam_report":
      // Its severity says whether it carries the scam's link or handle ("notice": removed so it doesn't spread) or not ("report": kept).
      return { actions: hit.severity === "report" ? [] : [DEL], offence: "none", notice: "scam_report", alert: "scam_report" };
    case "link_raid":
      return linkRaid(hit, ctx);
    case "lookalike":
    case "phishing":
      return scam(hit, ctx);
    case "fake_support":
      if (ctx.standing === "new" && hit.certain) return { actions: [DEL, { kind: "ban" }], offence: "certain", notice: "dm_warning", alert: "action" };
      return { ...ladder(hit, ctx), notice: "dm_warning" };
    case "flood":
      return ladder(hit, ctx, { kind: "mute", seconds: FLOOD_S });
    case "invite_link":
      if (ctx.standing === "trusted") return { actions: [DEL], offence: "none", notice: "removed", alert: "action" };
      return ctx.standing === "new" ? firstNote(hit, ctx, "newcomer") : ladder(hit, ctx);
    case "newcomer_link":
      return firstNote(hit, ctx, "newcomer");
    case "risky_file":
    case "edited_spam":
      return ladder(hit, ctx);
    case "abuse":
      return { actions: [DEL], offence: "none", notice: "removed", alert: "action" };
    case "unknown_link":
    case "brand_forward":
      return unknownLink(hit, ctx);
    case "contact_info":
      return { actions: [DEL], offence: "none", notice: "contact", alert: "action" };
    default:
      return bySeverity(hit, ctx);
  }
}
