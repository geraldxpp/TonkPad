import { fmt } from "@/shared/i18n/config";
import type { AdminAlert, AlertKind, Decision, ModAction, RuleCategory } from "../community/types";
import type { ModDeps, ModTarget } from "./actions";
import { SCAMS } from "./actions-decide";
import { DAY_S } from "./ladder";
import { durationText, type NoticeTemplate } from "./notices";

/**
 * What the group and the admins are told once a decision has been carried
 * out (mod/actions.ts): the notice and the alert say only what really took.
 */

/** Never an excerpt: a secret, a flaw's details, or the phone number or e-mail address that was removed for privacy. */
const NO_EXCERPT: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "contact_info"]);
/** Cases where admins decide what comes next, so their alerts stay. */
const ADMIN_DECIDES: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["abuse", "impersonation"]);
const SANCTION_NOTICES: ReadonlySet<string> = new Set(["warned", "muted", "banned"]);
const REMOVAL_NOTICES: ReadonlySet<string> = new Set(["removed", "newcomer", "contact", "secret", "secret_probable"]);
const ORDER: Record<ModAction["kind"], number> = { delete: 0, warn: 1, mute: 2, kick: 3, ban_sender_chat: 4, ban: 4 };

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** The action that bites hardest: a ban over a mute over a warning over a delete. */
export const top = (did: readonly ModAction[]): ModAction | null =>
  did.reduce<ModAction | null>((best, a) => (best === null || ORDER[a.kind] > ORDER[best.kind] || (a.kind === "mute" && best.kind === "mute" && a.seconds > best.seconds) ? a : best), null);

/** The notice that tells the truth about what took: a sanction's own, a removal's only when something was removed. */
export function noticeOf(d: Decision, did: readonly ModAction[]): NoticeTemplate | null {
  if (d.notice === null) return null;
  const removed = did.some((a) => a.kind === "delete");
  const hardest = top(did.filter((a) => a.kind !== "delete"));
  if (SANCTION_NOTICES.has(d.notice) || (REMOVAL_NOTICES.has(d.notice) && !removed)) {
    if (hardest) return hardest.kind === "mute" ? "muted" : hardest.kind === "warn" ? "warned" : "banned";
    return removed && SANCTION_NOTICES.has(d.notice) ? "removed" : null;
  }
  return d.notice === "removed" && d.category === "unknown_link" ? "linkRemoved" : d.notice;
}

/** What the bot did, in the admins' language, then what it leaves to them: the bot's own words only (alerts draw done escaped, not cleaned). */
function doneText(did: readonly ModAction[], category: RuleCategory, deps: ModDeps, left: { byHand: boolean; older: boolean }): string | null {
  const lang = deps.adminLang ?? "en";
  const d = deps.words(lang);
  const a = top(did);
  const values = { mentions: d.admin.member, reason: d.mod.reasons[category] };
  const template = !a ? null : a.kind === "mute" ? d.mod.muted : a.kind === "warn" ? d.mod.warned : a.kind === "delete" ? d.mod.removed : d.mod.banned;
  const duration = a?.kind === "mute" ? durationText(a.seconds, d, lang) : "";
  const parts = [template ? fmt(template, { ...values, duration }) : "", left.byHand ? d.admin.byHand : "", left.older ? d.admin.olderMessages : ""];
  return parts.filter((part) => part !== "").join(" ") || null;
}

/** The admins' alert about what took: Undo follows the hardest sanction, and a routine one is deleted after 47 hours. */
export function alertOf(kind: AlertKind, d: Decision & { aiGuess?: string | null }, t: ModTarget, did: readonly ModAction[], byHand: boolean, deps: ModDeps): AdminAlert {
  const hardest = top(did);
  // Undo follows what took: a first note (a delete, its offence recorded) has none, so it waits for the digest.
  const undo = t.user !== null && hardest && (hardest.kind === "warn" || hardest.kind === "mute" || hardest.kind === "ban") ? hardest.kind : null;
  // A member banned for a scam loses only their messages from the last 10 minutes; older ones are left to the admins.
  const older = t.user !== null && did.some((a) => a.kind === "ban") && SCAMS.has(d.category);
  const offersBan = d.source === "model" && hardest?.kind === "mute" && hardest.seconds >= DAY_S;
  const routine = (kind === "action" || kind === "observe") && !ADMIN_DECIDES.has(d.category) && !byHand && !offersBan;
  return {
    chat: t.chat,
    kind,
    category: d.category,
    member: { id: t.user, name: t.name, username: t.username, since: t.since ?? null },
    excerpt: NO_EXCERPT.has(d.category) || kind === "secret" || kind === "security" || !t.excerpt ? null : t.excerpt,
    link: t.link,
    done: doneText(did, d.category, deps, { byHand, older }),
    aiGuess: d.aiGuess ?? null,
    undo,
    messageId: t.messageIds.find(validId) ?? null,
    routine,
    urgent: false,
  };
}
