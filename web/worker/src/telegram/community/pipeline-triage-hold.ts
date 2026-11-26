import { forwardedFromMe, type Me } from "../agent/triggers";
import { ownCard } from "../mod/media";
import { botsOwnOf } from "../mod/rules-scan";
import type { TgMessage } from "../types";
import type { TriageJob } from "./pipeline-triage";
import type { Decision, RuleCategory } from "./types";

/**
 * What a message Haiku's check can't read is held for (prompts/15-community-
 * agent.md, Strictness, and Per-user and per-chat limits): in relaxed mode,
 * a member's unknown link or brand forward the rules kept up for the check;
 * and a new member's link, handle or address the rules left to it
 * (mod/rules-scan.ts linkKeys: never an allowed link, an official or an
 * admin's handle, or the pack's addresses). Never words the member didn't
 * write (the bot's own card, a forward of the bot's message, of the official
 * channel's post or of an admin's message, by ID: botsOwnOf), which never go
 * to the check (mod/triage.ts shouldTriage). Anything else posted through the
 * bot's inline mode is read as the member's own words, and held like them,
 * as is a forward vouched for by username alone. Held means deleted, with no
 * offence, the "removed" note and a routine alert; never in observe mode,
 * nor once the rules removed the message.
 */

/**
 * The bot's own inline card (via the bot, with its Refresh button:
 * mod/media.ts ownCard) or a forward of one of its messages (a user forward
 * from the bot, forwardedFromMe), the bot known by its ID alone: never an
 * account that holds one of its usernames, nor a forward of another type
 * that carries the bot's user. The rules' markers say the same, and more.
 */
const botsOwn = (m: TgMessage, me: Me | null): boolean => ownCard(m, me) || forwardedFromMe(m, me);

export function heldDecision(job: TriageJob, me: Me | null): (Decision & { aiGuess: null }) | null {
  if (job.removed || job.ctx.strictness === "observe") return null;
  // Never sent to the check, so nothing in them waits on it.
  if (botsOwn(job.m, me) || botsOwnOf(job.result.markers)) return null;
  const kept = job.ctx.strictness === "relaxed"
    ? job.hits.find((h) => (h.category === "unknown_link" || h.category === "brand_forward") && h.severity === "alert")
    : undefined;
  const newcomer = job.ctx.standing === "new" && job.result.markers.linkKeys.length > 0;
  const category: RuleCategory | null = kept?.category ?? (newcomer ? "newcomer_link" : null);
  if (category === null) return null;
  return { actions: [{ kind: "delete" }], category, source: "rule", offence: "none", notice: "removed", alert: "action", observeOnly: false, aiGuess: null };
}
