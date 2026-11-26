/**
 * How a banned claim is written down for agent/claims.ts. Patterns run over
 * normalized text (claims.ts: NFKC, lower case, "ё" as "е", straight
 * apostrophes, single spaces, and tonkfun.fun, Pump.fun and Bonk.fun as the
 * single words tonkfun, pumpfun and bonkfun), so they are lower case with
 * literal spaces.
 */

/** Each claim's English name: what findClaims reports, safe to log (never the model's words). */
export const CLAIM_NAMES = [
  "guaranteed",
  "risk-free",
  "can't lose",
  "safe to buy",
  "not a scam",
  "legit",
  "multiplier",
  "to the moon",
  "price target",
  "zero fees",
  "official partner",
  "will be listed",
  "airdrop live",
  "presale",
  "official token",
  "team promise",
  "trade advice",
  "price move",
  "token is safe",
] as const;
export type ClaimName = (typeof CLAIM_NAMES)[number];

export interface ClaimRule {
  name: ClaimName;
  re: RegExp;
  /**
   * Whether a negation shortly before it in the same clause ("nothing is
   * guaranteed", "no es seguro comprar") or, in Japanese, Korean and
   * Turkish, just after it ("保証されていません") makes it a disclaimer.
   * Claims that already deny ("can't lose", "not a scam", "no fees") never are.
   */
  negatable: boolean;
}

/** A letter, mark, digit or underscore: what a whole word may not touch. */
const EDGE = "[\\p{L}\\p{M}\\p{N}_]";

/** Whole words, for languages written with spaces between words. */
export function words(source: string): RegExp {
  return new RegExp(`(?<!${EDGE})(?:${source})(?!${EDGE})`, "gu");
}

/** Anywhere in running text, for Chinese, Japanese and Korean, where words aren't spaced or take particles. */
export function inText(source: string): RegExp {
  return new RegExp(source, "gu");
}

/** A claim a nearby negation can turn into a disclaimer. */
export const may = (name: ClaimName, re: RegExp): ClaimRule => ({ name, re, negatable: true });

/** A claim that stands whatever surrounds it. */
export const never = (name: ClaimName, re: RegExp): ClaimRule => ({ name, re, negatable: false });
