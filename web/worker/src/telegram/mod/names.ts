import { createHash } from "node:crypto";
import { claimsBrand } from "../channel";
import type { AllowList } from "../community/types";
import { findHandles, findLinks } from "./links";
import { brandSquashed } from "./names-brand";
import { compact, fold, within } from "./names-fold";
import { CJK, matchesAny, ROLE_WORDS, SUPPORT_WORDS } from "./words";

export { brandLookalike, fold, teamAddress } from "./names-fold";

/**
 * Display names and member tags: their fingerprint (what trust covers) and
 * whether one poses as the team.
 */

/** A name's fingerprint, as the records keep it for a trusted member: 16 hex of the SHA-256 of its folded form. */
export function nameHash(name: string): string {
  return createHash("sha256").update(fold(name)).digest("hex").slice(0, 16);
}

/** Every role word folded, as names are: "Help Desk" → "help desk", "Поддержка" in its folded letters. */
const ROLES = [...new Set(ROLE_WORDS.map(fold).filter(Boolean))];
/**
 * Role words that are also given names or everyday words: never "only role
 * words" on their own. Dev; 지원 (support in Korean, and the given name
 * Ji-won); Resmi (official in Indonesian and Turkish, and a given name); CS
 * (customer service, and initials).
 */
const NAME_LIKE = new Set(["dev", "지원", "resmi", "cs"].map(fold));
/** Everyday words that hold a role word without being one ("Supporter", 支持者 a supporter): taken out before the role words are read. */
const NOT_ROLES = /supporters?|supportive|支持者/gu;
const NO_LINKS: AllowList = { domains: [], telegram: [], x: [] };

/** The folded name with each role word or phrase taken out: whole words, but anywhere for Chinese, Japanese and Korean. */
function withoutRoles(folded: string): { rest: string; found: boolean } {
  const base = ` ${folded.replace(NOT_ROLES, " ")} `;
  let rest = base;
  for (const role of ROLES) rest = CJK.test(role) ? rest.split(role).join(" ") : rest.split(` ${role} `).join("  ");
  return { rest: rest.trim(), found: rest.replace(/\s+/g, " ") !== base.replace(/\s+/g, " ") };
}

/** A role word in a name or title as it reads folded ("Crypto Support Hub", "官方客服"). */
export const hasRoleWord = (text: string) => withoutRoles(fold(text)).found;

/** A Korean name of three syllables whose given name is also a role word: 김지원 (Kim Ji-won), never 고객지원 (customer support). */
const HANGUL_NAME = /^\p{Script=Hangul}지원$/u;

/**
 * The folded name without the given names that are also role words
 * (NAME_LIKE): such a word reads as a role only as a whole word right after
 * the brand ("Tonkfun Dev", "$TONK 지원"); before it or beside another name
 * ("Dev Patel $TONK", "지원 | $TONK", "Resmi | $TONK") it is someone's name,
 * and inside a Korean name ("김지원 $TONK", "Tonkfun 김지원") always.
 */
function withoutGivenNames(folded: string): string {
  const words = folded.split(" ");
  const afterBrand = (i: number) => i > 0 && (claimsBrand(words[i - 1], "") || brandSquashed(words.slice(Math.max(0, i - 3), i).join(" ")));
  // fold leaves Hangul as its letters (NFKD); NFC puts the syllables back together.
  return words.filter((word, i) => !HANGUL_NAME.test(word.normalize("NFC")) && (!NAME_LIKE.has(word) || afterBrand(i))).join(" ");
}

/** A role word in the name, glued to the brand ("TonkfunSupport"), or a support word anywhere in it run together ("Tonkfun Suport"); given names that are also role words aside (withoutGivenNames). */
function hasRole(name: string): boolean {
  const folded = withoutGivenNames(name);
  if (withoutRoles(folded).found) return true;
  const words = folded.replace(NOT_ROLES, " ").split(" ");
  if (words.some((word) => word.startsWith("tonk") && ROLES.some((role) => !CJK.test(role) && role.length >= 3 && word.slice(4).includes(role.replace(/ /g, ""))))) return true;
  return matchesAny(SUPPORT_WORDS, words.join(""));
}

/** A name made only of role words ("Support", "Help Desk", "Customer care"), except a lone given name or everyday word like Dev. */
function onlyRoles(folded: string): boolean {
  if (folded === "" || NAME_LIKE.has(folded)) return false;
  const { rest, found } = withoutRoles(folded);
  return found && rest === "";
}

/** The brand by the channel's word rule (on the name as written and folded), or split or one edit off once run together (names-fold.ts brandSquashed). */
const claims = (raw: string, folded: string) => claimsBrand(raw, "") || claimsBrand(folded, "") || brandSquashed(folded);

/**
 * Whether a member's display name or member tag poses as the team. "link":
 * the name or tag holds a link or a @username. "impersonation": the full
 * folded name is an admin's and the username is within two edits of that
 * admin's (both missing counts as equal); or the brand (claimsBrand, or
 * split by spaces or punctuation, or one look-alike edit off: "T.onkfun",
 * "Tomkfun"; never another launchpad's name or TON's, names-brand.ts)
 * beside a role or support word (a given name that is also one only right
 * after the brand: "Tonkfun Dev", never "Dev Patel $TONK"); or the name or
 * tag is only role words
 * (some are also names, such as Dev or 지원, and stand alone); or the name
 * reads within two edits of one of the bot's usernames, or of one without
 * its "bot" ending (TonkFun). Admins themselves are never checked, nor a
 * tag the admins set (both the caller's part: tag null).
 */
export function nameRisk(input: {
  name: string;
  username: string | null;
  tag: string | null;
  admins: ReadonlyArray<{ name: string; username: string | null }>;
  bot: readonly string[];
}): "link" | "impersonation" | null {
  const texts = [input.name, input.tag ?? ""].filter((t) => t.trim() !== "");
  if (texts.some((t) => findLinks(t, [], NO_LINKS).length > 0 || findHandles(t, []).length > 0)) return "link";

  const name = fold(input.name);
  const tag = fold(input.tag ?? "");
  const whole = name.replace(/ /g, "");
  const user = (input.username ?? "").toLowerCase();
  if (whole.length >= 2 && input.admins.some((a) => compact(a.name) === whole && within(user, (a.username ?? "").toLowerCase(), 2))) return "impersonation";
  // claimsBrand reads the channel's look-alikes; on the folded text it also reads digits ("7onkfun").
  if ((claims(input.name, name) && hasRole(name)) || (claims(input.tag ?? "", tag) && hasRole(tag))) return "impersonation";
  if (onlyRoles(name) || onlyRoles(tag)) return "impersonation";
  const bots = input.bot.map(compact).flatMap((b) => (b.endsWith("bot") && b.length >= 8 ? [b, b.slice(0, -3)] : [b]));
  if (whole.length >= 4 && bots.some((b) => b !== "" && within(whole, b, 2))) return "impersonation";
  return null;
}
