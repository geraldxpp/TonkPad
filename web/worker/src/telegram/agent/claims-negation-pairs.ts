import type { Locale } from "@/shared/i18n/config";
import type { ClaimName } from "./claims-rule";

/**
 * Two finer readings of a negation near a banned claim (agent/claims.ts,
 * answers#5), for English, whose negations don't agree with each other as
 * Romance and Slavic ones do ("rien n'est garanti", "ни один … не" deny
 * once; those languages' double negatives are frames in
 * claims-negation-frames.ts):
 * - two negations cancel when the later one is on a verb ("there's no way
 *   it isn't legit", "nobody can say it isn't"): the claim stands. "Whether"
 *   and "nor" never count (they doubt or pair, not deny), and two
 *   quantifiers ("no score and no badge make a token legit") still deny;
 * - "legit" and "guaranteed" are denied by a quantifier ("no", "nothing",
 *   "nobody") only within about 3 words of the claim word, its subject's
 *   word and little words such as "a", "of", "is" or "here" aside ("no
 *   score makes a token legit", "no profit on any token is guaranteed"),
 *   and by a negation on a verb anywhere in the window ("a high score
 *   doesn't mean a token is legit"): a quantifier further off frames
 *   something else.
 */

const EDGE = "[\\p{L}\\p{M}\\p{N}_]";
const whole = (source: string, flags: string) => new RegExp(`(?<!${EDGE})(?:${source})(?!${EDGE})`, flags);

/** A negation on a verb: "not", "never", "cannot", "isn't", "can't". */
const ON_VERB = whole("not|never|cannot|\\p{L}+n't", "u");
/** Every negation that denies something (not "whether", which doubts, nor "nor", which pairs with another). */
const DENIES = whole("not|no|never|nothing|nobody|none|neither|without|cannot|no one|no-one|\\p{L}+n't", "gu");
/** Quantifiers reach "legit" and "guaranteed" only from this many words away, little words aside. */
const NEAR_WORDS = 4;
/** Little words that don't count toward that distance. */
const LITTLE = new Set(["a", "an", "the", "and", "or", "any", "every", "each", "some", "of", "on", "in", "at", "for", "from", "to", "by", "with", "about", "here", "ever", "yet", "really", "actually", "truly", "always", "currently", "necessarily", "is", "are", "was", "were", "be", "been", "being", "it", "its", "it's", "this", "that", "these", "those", "which", "if", "whether"]);
const CLOSE: ReadonlySet<ClaimName> = new Set<ClaimName>(["legit", "guaranteed"]);

const english = (lang: Locale | undefined) => lang === undefined || lang === "en";

/** The denying negations in `text`, in order. */
const denials = (text: string): RegExpMatchArray[] => [...text.matchAll(DENIES)];

/** Whether two negations in `text` (a claim's window, or the first clause of the reply to it) cancel: a later one on a verb after an earlier one. */
export function cancels(text: string, lang: Locale | undefined): boolean {
  if (!english(lang)) return false;
  const found = denials(text);
  return found.length >= 2 && found.slice(1).some((m) => ON_VERB.test(m[0]));
}

/**
 * Whether a negation in `window` (the words just before the claim) denies
 * the claim `name`: for English "legit" and "guaranteed", a negation on a
 * verb anywhere in it, a quantifier within its last 4 words (little words
 * aside), or a "whether" or "if" that makes it a doubt; otherwise any
 * negation `before` finds in it.
 */
export function denies(window: string, before: RegExp, name: ClaimName, lang: Locale | undefined): boolean {
  if (!english(lang) || !CLOSE.has(name)) return before.test(window);
  const found = denials(window);
  if (found.some((m) => ON_VERB.test(m[0]))) return true;
  const near = window.trim().split(/\s+/u).filter((word) => !LITTLE.has(word)).slice(-NEAR_WORDS).join(" ");
  return denials(near).length > 0 || /(?<![\p{L}\p{M}\p{N}_])(?:whether|if)(?![\p{L}\p{M}\p{N}_])/u.test(window);
}
