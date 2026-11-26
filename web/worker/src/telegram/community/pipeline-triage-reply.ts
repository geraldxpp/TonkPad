import { LINK_PATHS } from "../agent/render";
import { escapeHtml as esc } from "../text";
import type { View } from "../types";
import type { Escalation } from "./types";
import type { CommunityDictionary } from "./words";

const BUSINESS: ReadonlySet<Escalation> = new Set<Escalation>(["legal", "press", "listing", "partnership"]);
const TEAM_TOLD: ReadonlySet<Escalation> = new Set<Escalation>(["lost_funds", "stuck_tx", "bug", "scam_report"]);

/**
 * What a member sees in the group when Haiku's check finds their case needs
 * a person (prompts/15-community-agent.md, Human attention): the Security
 * page's contact for a flaw, legal matters, press, listings or
 * partnerships; "I've let the team know" for lost funds, a stuck
 * transaction, a bug or a scam; nothing for an angry member or when the bot
 * couldn't tell (an alert only). Fixed words, never the model's; the
 * Security button is unprefixed, so each reader gets their own language.
 */
export function escalationView(kind: Escalation, w: CommunityDictionary, site: string): View | null {
  const security = { inline_keyboard: [[{ text: w.links.security, url: `${site}${LINK_PATHS.security}` }]] };
  if (kind === "security") return { text: esc(w.answer.flaw), keyboard: security };
  if (BUSINESS.has(kind)) return { text: esc(w.answer.business), keyboard: security };
  return TEAM_TOLD.has(kind) ? { text: esc(w.answer.escalated) } : null;
}
