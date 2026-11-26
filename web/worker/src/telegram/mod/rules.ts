import type { AllowList, RuleResult, Severity, Standing, Strictness } from "../community/types";
import type { TgMessageEntity } from "../types";
import { brandLookalike, nameRisk, teamAddress } from "./names";
import { baitBesideLink } from "./rules-bait";
import { emailOfferOf, readEmails } from "./rules-emails";
import { brandForward, newcomerForward } from "./rules-forwards";
import { Hits, scamHits, severeKeys, toScamReport } from "./rules-hits";
import { readReport } from "./rules-report";
import { type Scan, scanMessage } from "./rules-scan";
import { readSolicitation } from "./rules-solicit";
import { readSentences } from "./rules-text";
import { findSecret } from "./secrets";
import { ABUSE, matchesAny, SECURITY_WORDS } from "./words";

export { allAddresses, isQuestion, plainText } from "./rules-scan";

/** What the rules read about a message and its author; the caller works these out from the update, its records and Telegram's admin list. */
export interface RuleInput {
  /** The text or caption. */
  text: string;
  /** Its entities (entities or caption_entities). */
  entities: readonly TgMessageEntity[];
  standing: Standing;
  strictness: Strictness;
  raid: boolean;
  edited: boolean;
  /** For an edit: whether it added a link key the bot remembered the original without (mod/edits.ts); null without a record. */
  addedLinks: boolean | null;
  /** How old the message is; a new message over 5 minutes old arrived while the worker was down. */
  ageSeconds: number;
  forwarded: boolean;
  forwardName: string | null;
  /** The forward's username (media.ts forwardUsername): see rules-forwards.ts. */
  forwardUsername?: string | null;
  /** A forward whose author is known by ID (rules-forwards.ts): a user forward from the bot (agent/triggers.ts forwardedFromMe) or an admin, or one from the official channel (media.ts fromChannel). */
  forwardSelf?: boolean;
  forwardAdmin?: boolean;
  forwardChannel?: boolean;
  /** The bot's own token card, posted through its inline mode or passed on (media.ts ownCard). With the three above, words the member didn't write (rules-scan.ts botsOwnOf). */
  ownCard?: boolean;
  externalOtherChat: boolean;
  viaButtons: boolean;
  /** The targets of the message's link buttons (media.ts buttonLinks), read like links in the text. */
  buttons?: readonly string[];
  riskyFile: boolean;
  /** The author's display name, username and member tag. */
  sender: { name: string; username: string | null; tag: string | null };
  /**
   * Members can't edit their own tag (getChat's can_edit_tag isn't true), so
   * a tag is the admins' word and isn't read as a name. Unknown (undefined:
   * getChat hasn't answered for the group yet) counts as the admins' word too;
   * only false reads the tag.
   */
  tagsByAdmins?: boolean;
  admins: ReadonlyArray<{ name: string; username: string | null }>;
  /** The bot's usernames: the name rules read them; they never vouch for a forward (rules-forwards.ts). */
  bot: readonly string[];
  allow: AllowList;
  /** The knowledge pack's own addresses: never raid material. */
  packAddresses: ReadonlySet<string>;
  /** Trusted, and the name is the one trusted: the name rule is skipped. */
  trustedName: boolean;
}

const STALE_SECONDS = 300;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const named = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Telegram's fields are untrusted: texts and names as strings, lists as lists, so a malformed update can't throw in the rules. */
function safe(input: RuleInput): RuleInput {
  const entities: unknown = input.entities;
  const buttons: unknown = input.buttons;
  return {
    ...input,
    text: str(input.text),
    entities: Array.isArray(entities) ? entities.filter((e: unknown): e is TgMessageEntity => typeof e === "object" && e !== null && typeof (e as { type?: unknown }).type === "string") : [],
    // Kept for scanMessage, which reads them like links in the text (and bounds how many and how long).
    buttons: Array.isArray(buttons) ? buttons.filter((b: unknown): b is string => typeof b === "string") : [],
    sender: { name: str(input.sender?.name), username: named(input.sender?.username), tag: named(input.sender?.tag) },
    tagsByAdmins: input.tagsByAdmins !== false,
    admins: (Array.isArray(input.admins) ? input.admins : []).map((a) => ({ name: str(a?.name), username: named(a?.username) })),
    forwardName: named(input.forwardName),
  };
}

/** What an entity covers in the text, or "" when it doesn't fit. */
function covered(text: string, e: TgMessageEntity): string {
  const { offset, length } = e;
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length > 0 ? text.slice(offset, offset + length) : "";
}

/** Contact details Telegram marked (phone numbers and e-mail addresses), but never an address at the team's own domains: the Security contact is official. */
const contactCount = (input: RuleInput) => input.entities.filter((e) => e.type === "phone_number" || (e.type === "email" && !teamAddress(covered(input.text, e)))).length;

/** The name and member-tag rules; a tag the admins set (members can't edit theirs, or getChat hasn't said yet) isn't read. */
function nameHits(input: RuleInput, hits: Hits): void {
  if (input.trustedName) return;
  const tag = input.tagsByAdmins === true ? null : input.sender.tag;
  const risk = nameRisk({ name: input.sender.name, username: input.sender.username, tag, admins: input.admins, bot: input.bot });
  if (risk === "link") hits.add("name_link", "scam", true, "a link or handle in the name");
  else if (risk === "impersonation") hits.add("impersonation", "scam", false, "a name posing as the team");
}

/** A flaw report: security words with 200 characters or more, code, or an address. */
function flawReport(scan: Scan, input: RuleInput): boolean {
  if (!matchesAny(SECURITY_WORDS, scan.plain)) return false;
  const code = input.entities.some((e) => e.type === "code" || e.type === "pre");
  return [...input.text].length >= 200 || code || scan.markers.addresses.length > 0;
}

/**
 * Links by standing. A new member: any link that isn't allowed or official
 * (look-alikes and invites have their own rules), a forward nobody vouches
 * for (rules-forwards.ts), another bot's link buttons or a reply to another
 * chat. A member: such a link, or a forward named like the team, by
 * strictness (relaxed keeps them for Haiku's check unless raid mode is on,
 * when there is none). Trusted members skip both.
 */
function linkHits(scan: Scan, input: RuleInput, hits: Hits): void {
  const plain = scan.risky.filter((l) => l.kind !== "telegram_invite" && l.kind !== "lookalike" && !(l.kind === "obfuscated" && l.domain !== null && brandLookalike(l.domain)));
  if (input.standing === "new") {
    if (plain.length > 0 || newcomerForward(input) || input.viaButtons || input.externalOtherChat) hits.add("newcomer_link", "notice", false, "a new member's link, forward or link buttons");
    return;
  }
  if (input.standing !== "member") return;
  const severity: Severity = input.strictness === "relaxed" && !input.raid ? "alert" : "notice";
  if (plain.length > 0) hits.add("unknown_link", severity, false, "a link to a site not on the allow-list");
  if (brandForward(input)) hits.add("brand_forward", severity, false, "a forward from a chat or user named like the team");
}

/**
 * The instant rules (prompts/15-community-agent.md, Moderation, The rules),
 * in code, for one message. Admins get no hits. Severity says what a hit
 * asks for: protect (a secret: delete, never an offence), scam (delete,
 * then mute or ban), offence (delete, then the ladder), notice (delete
 * with a note; the first newcomer or unknown link, contact details, a flaw
 * report, or a scam report that carries the link), report (a scam report
 * kept up, with the warning) and alert (keep or delete as the category
 * says, and tell the admins). Only certain hits can lead to a ban.
 *
 * A report (rules-report.ts: report words aimed at the link or handle, or a
 * legitimacy question about it, never one that also tells the reader to act
 * on the link or vouches for it) turns the scam hits into a scam_report,
 * never an offence; a question alone never does, nor does a report when the
 * author offers to be messaged privately themselves (rules-solicit.ts; a
 * help request to the team is no offer). Bait counts only as the author's
 * own instruction (rules-bait.ts). A strong self-harm
 * phrase (markers.crisis "strong") changes no hit: the member is never
 * punished for the message, which the decision sees by that marker (it
 * keeps the deletes and drops every sanction), but a link, a file or a
 * secret in it is still removed. A new message over 5 minutes old keeps
 * only its certain, deleting hits. The markers come with every result, for
 * Haiku's check and the triggers.
 */
export function checkMessage(raw: RuleInput): RuleResult {
  const input = safe(raw);
  const scan = scanMessage(input);
  if (input.standing === "admin") return { hits: [], markers: scan.markers };
  const hits = new Hits();
  const isNew = input.standing === "new";
  const trusted = input.standing === "trusted";

  const secret = findSecret(input.text);
  if (secret === "seed_probable") hits.add("secret_probable", "protect", true, "what may be a recovery phrase");
  else if (secret) hits.add("secret", "protect", true, "a recovery phrase or private key");
  if (flawReport(scan, input)) hits.add("security_report", "notice", true, "a flaw report");

  const emails = readEmails(input.text, input.entities);
  const sentences = readSentences(input, emails.lookalike);
  const report = readReport(sentences, scan.plain);
  emails.support = emailOfferOf(emails, input.text, report.words);
  const solicit = readSolicitation(input, report.words);
  const baitBeside = baitBesideLink(sentences);
  scamHits(scan, hits, { isNew, trusted, brand: brandLookalike }, solicit, { baitBeside, emails });
  // Trusted members may ask to be messaged; anyone else's own offer (a "DM me", an address to write to for help) makes the message no report.
  const offers = (solicit.own || emails.support) && !trusted;
  const reported = report.report && !offers && toScamReport(scan, hits, solicit, emails);
  const raidKeys = new Set<string>(scan.markers.raidKeys);
  Object.assign(scan.markers, {
    reportWords: report.words,
    reports: report.report && !offers,
    dmRequest: solicit.request && !solicit.own,
    // Only raid keys can be severe: a bot command's links are none.
    severeKeys: severeKeys(scan, baitBeside, brandLookalike).filter((k) => raidKeys.has(k)),
  });

  nameHits(input, hits);
  if (!reported) linkHits(scan, input, hits);
  if (!trusted && contactCount(input) > 0) hits.add("contact_info", "notice", false, "a phone number or e-mail address");
  if (!trusted && input.riskyFile) hits.add("risky_file", "offence", false, "an executable or archive");
  if (matchesAny(ABUSE, scan.plain, scan.folded)) hits.add("abuse", "alert", false, "a slur or threat");
  if (input.edited && input.addedLinks === true && scan.markers.linkKeys.length > 0) hits.add("edited_spam", "offence", false, "a link, handle or address added by an edit");

  let list = hits.list();
  if (!input.edited && input.ageSeconds > STALE_SECONDS) list = list.filter((h) => h.certain && h.severity !== "report" && h.severity !== "alert");
  return { hits: list, markers: scan.markers };
}
