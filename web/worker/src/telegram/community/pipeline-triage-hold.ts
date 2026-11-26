import type { Me } from "../agent/triggers";
import type { TgMessage, TgUser } from "../types";
import type { TriageJob } from "./pipeline-triage";
import type { Decision, RuleCategory } from "./types";

/**
 * What a message Haiku's check can't read is held for (prompts/15-community-
 * agent.md, Strictness, and Per-user and per-chat limits): in relaxed mode,
 * a member's unknown link or brand forward the rules kept up for the check;
 * and a new member's link, handle or address the rules left to it
 * (mod/rules-scan.ts linkKeys: never an allowed link, an official or an
 * admin's handle, or the pack's addresses), unless it is the bot's own card
 * or a forward of the bot's message. Held means deleted, with no offence,
 * the "removed" note and a routine alert; never in observe mode, nor once
 * the rules removed the message.
 */

const named = (user: TgUser, me: Me): boolean =>
  user.id === me.id || (typeof user.username === "string" && me.usernames.some((u) => u.replace(/^@/, "").toLowerCase() === user.username?.toLowerCase()));

/** The bot's own inline card (sent via the bot) or a forward of one of its messages. */
function botsOwn(m: TgMessage, me: Me | null): boolean {
  if (!me) return false;
  const users = [m.via_bot, m.forward_origin?.sender_user];
  return users.some((u) => typeof u === "object" && u !== null && named(u, me));
}

export function heldDecision(job: TriageJob, me: Me | null): (Decision & { aiGuess: null }) | null {
  if (job.removed || job.ctx.strictness === "observe") return null;
  const kept = job.ctx.strictness === "relaxed"
    ? job.hits.find((h) => (h.category === "unknown_link" || h.category === "brand_forward") && h.severity === "alert")
    : undefined;
  const newcomer = job.ctx.standing === "new" && job.result.markers.linkKeys.length > 0 && !botsOwn(job.m, me);
  const category: RuleCategory | null = kept?.category ?? (newcomer ? "newcomer_link" : null);
  if (category === null) return null;
  return { actions: [{ kind: "delete" }], category, source: "rule", offence: "none", notice: "removed", alert: "action", observeOnly: false, aiGuess: null };
}
