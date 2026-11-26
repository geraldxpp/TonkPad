import type { RuleCategory, RuleHit, Severity } from "../community/types";
import type { FoundLink } from "./links";
import { compact, fold } from "./names-fold";
import type { Emails } from "./rules-emails";
import type { Scan } from "./rules-scan";
import type { Solicitation } from "./rules-solicit";
import { DRAINER_NAMES, matchesAny, SUPPORT_WORDS } from "./words";

/**
 * The hits a message collects, one per category, and the scam rules: look-
 * alike and drainer links, fake support, invite links, and their turn into a
 * scam report when the member reports one.
 */

const RANK: Readonly<Record<Severity, number>> = { report: 0, alert: 1, notice: 2, protect: 3, offence: 4, scam: 5 };

/** Hits by category: a second hit of a category keeps the stronger severity, and is certain if either was. */
export class Hits {
  private readonly byCategory = new Map<RuleCategory, RuleHit>();

  add(category: RuleCategory, severity: Severity, certain: boolean, detail: string): void {
    const old = this.byCategory.get(category);
    const stronger = !old || RANK[severity] > RANK[old.severity];
    this.byCategory.set(category, { category, severity: stronger ? severity : old.severity, certain: certain || (old?.certain ?? false), detail: stronger ? detail : old.detail });
  }

  has(category: RuleCategory): boolean {
    return this.byCategory.has(category);
  }

  /** Removes these categories and returns what was there. */
  take(categories: readonly RuleCategory[]): RuleHit[] {
    const taken = categories.flatMap((c) => this.byCategory.get(c) ?? []);
    for (const c of categories) this.byCategory.delete(c);
    return taken;
  }

  list(): RuleHit[] {
    return [...this.byCategory.values()];
  }
}

const SCAMS: readonly RuleCategory[] = ["lookalike", "phishing", "fake_support", "invite_link"];

/** Telegram usernames a message names: its risky Telegram links' and its other @handles. */
const usernames = (scan: Scan) => [...scan.risky.flatMap((l) => (l.key.startsWith("@") ? [l.key.slice(1)] : [])), ...scan.strangers];
/** A path segment long enough to be an address, a signature or an ID: letters and digits that only spell bait by chance. */
const ID = /^[A-Za-z0-9]{26,}$/;

/** What a risky link names itself: its username, X handle or host, and apart from that its path (links-kind.ts raid: no query), IDs left out. */
function linkName(link: FoundLink): { name: string; path: string } {
  if (link.key.startsWith("@")) return { name: compact(link.key.slice(1)), path: "" };
  const parts = link.raid.replace(/^x\.com\//, "").split("/");
  return { name: compact(parts[0] ?? ""), path: compact(parts.slice(1).filter((part) => !ID.test(part)).join("/")) };
}

/**
 * A drainer link: one whose own name is the bait (its host, its username,
 * its X handle), or whose path is, when the host itself is suspicious (a
 * look-alike or a hidden-dot host). Bait only in the path of an ordinary
 * site ("coingecko.com/learn/what-is-a-crypto-airdrop", "solana.com/staking/rewards")
 * is just that link.
 */
function drainerLink(link: FoundLink): boolean {
  const { name, path } = linkName(link);
  if (matchesAny(DRAINER_NAMES, name)) return true;
  return (link.kind === "lookalike" || link.kind === "obfuscated") && matchesAny(DRAINER_NAMES, path);
}

/**
 * The raid keys of the message's severe links, the kinds a raid of new
 * members is banned for (flood-raids.ts): a look-alike, a drainer, a
 * hidden-dot host or an invite; every risky link when bait stands beside it.
 */
export function severeKeys(scan: Scan, baitBeside: boolean, brand: (domain: string) => boolean): string[] {
  const severe = scan.risky.filter((l) => baitBeside || l.kind === "lookalike" || l.kind === "obfuscated" || l.kind === "telegram_invite" || drainerLink(l) || (l.domain !== null && brand(l.domain)));
  return [...new Set(severe.map((l) => l.raid))];
}

/**
 * The scam rules, for everyone but admins (and, for fake support, trusted
 * members). Look-alike: a look-alike domain, written plainly or with a
 * hidden dot, or an e-mail address at one. Drainer: a drainer link or
 * handle (drainerLink), or a risky link beside imperative or second-person
 * bait the author gives (`baitBeside`: rules-bait.ts; never a question, a
 * member's own trouble or a warning); bare nouns such as airdrop or presale
 * leave the link to its own rule. Fake support: the author's own
 * solicitation (rules-solicit.ts), rule-certain only as an offer of support
 * or beside bait, someone else's quoted in a report, asking members to write
 * to an address for help, or a support or admin username that isn't
 * official; a help request ("admins, DM me") is none. Invite: any invite
 * link that isn't official.
 */
export function scamHits(scan: Scan, hits: Hits, who: { isNew: boolean; trusted: boolean; brand: (domain: string) => boolean }, solicit: Solicitation, read: { baitBeside: boolean; emails: Emails }): void {
  const lookalike = scan.risky.some((l) => l.kind === "lookalike" || (l.kind === "obfuscated" && l.domain !== null && who.brand(l.domain)));
  if (lookalike || read.emails.lookalike.length > 0) hits.add("lookalike", "scam", true, "a look-alike link");

  const drainer = scan.risky.some(drainerLink) || scan.strangers.some((u) => matchesAny(DRAINER_NAMES, compact(u)));
  if (drainer || (scan.risky.length > 0 && read.baitBeside)) hits.add("phishing", "scam", true, "a drainer link or handle");

  if (!who.trusted) {
    const severity: Severity = who.isNew ? "scam" : "offence";
    if (solicit.own || solicit.quoted) hits.add("fake_support", severity, solicit.own && solicit.certain, "asks members to message privately");
    else if (read.emails.support) hits.add("fake_support", severity, false, "asks members to write to an address for help");
    else if (usernames(scan).some((u) => matchesAny(SUPPORT_WORDS, fold(u), compact(u)))) hits.add("fake_support", severity, false, "a support or admin handle that isn't official");
  }

  if (scan.risky.some((l) => l.kind === "telegram_invite")) hits.add("invite_link", who.isNew || who.trusted ? "notice" : "offence", true, "an invite link to another chat");
}

/**
 * Reporting a scam (report words; the caller's part, as is never turning
 * the author's own solicitation into one): the look-alike, drainer, fake
 * support and invite hits become one scam_report, never an offence. Its
 * severity says what happens to the message: "notice" when it carries the
 * link, the handle or the quoted solicitation (deleted, so it doesn't
 * spread, with the warning; a look-alike address too), "report" when it
 * doesn't (kept, with the warning). It is certain when a hit it replaced
 * was. True when there was anything to turn.
 */
export function toScamReport(scan: Scan, hits: Hits, solicit: Solicitation, emails: Emails): boolean {
  const taken = hits.take(SCAMS);
  if (taken.length === 0) return false;
  const carries = scan.risky.length > 0 || scan.strangers.length > 0 || solicit.quoted || emails.lookalike.length > 0;
  const detail = carries ? "reports a scam, and carries its link, handle or words" : "reports a scam";
  hits.add("scam_report", carries ? "notice" : "report", taken.some((h) => h.certain), detail);
  return true;
}
