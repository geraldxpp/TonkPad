import type { Locale } from "@/shared/i18n/config";
import { visibleText } from "../../text";
import { CLAIMS_LATIN } from "./claims-latin";
import { FAMILIES_LATIN } from "./claims-latin-families";
import { FORMS_LATIN } from "./claims-latin-families-forms";
import { ANY_NEGATION, type Negation, NEGATIONS } from "./claims-negation";
import { ANY_FRAMES, FRAMES, type Frames, maskFrames } from "./claims-negation-frames";
import { cancels, denies } from "./claims-negation-pairs";
import { CLAIMS_OTHER } from "./claims-other";
import { FAMILIES_OTHER } from "./claims-other-families";
import { FORMS_OTHER } from "./claims-other-families-forms";
import { type ClaimName, type ClaimRule, never, words } from "./claims-rule";

/**
 * Banned claims (prompts/15-community-agent.md, Guardrails): promises the
 * bot never makes, in the site's 12 languages. An answer holding one becomes
 * the "not sure" answer. Most of them read the other way after a negation
 * ("nothing is guaranteed", "no es seguro comprar", "保証されていません"),
 * so a negation close by in the same clause (claims-negation.ts) makes
 * those a disclaimer, unless it belongs to an intensifier or a frame ("no
 * doubt it's legit", "there's no denying"), sits before a contrast ("not
 * advice, but it is…"), or the claim is a question the answer goes on to
 * affirm ("Is it legit? It is."): claims-negation-frames.ts. In English two
 * negations cancel ("no way it isn't legit"), and "legit" and "guaranteed"
 * take a quantifier only from close by: claims-negation-pairs.ts.
 */

export type { ClaimName } from "./claims-rule";

/** "10x", "x100", "100倍", "10배", "tenfold": a multiplier is a price promise in any language. */
const MULTIPLIERS: readonly ClaimRule[] = [
  never("multiplier", /(?<![\p{L}\p{N}_.,])\d+(?:\.\d+)?[xх×](?![\p{L}\p{N}_])/gu),
  never("multiplier", /(?<![\p{L}\p{N}_])[xх×]\d+(?:\.\d+)?(?![\p{L}\p{N}_%])/gu),
  never("multiplier", /\d+ ?(?:倍|배)|[十百千]倍/gu),
  never("multiplier", words("\\d+ ?-?fold|(?:ten|hundred|thousand)fold")),
];

const RULES: readonly ClaimRule[] = [...MULTIPLIERS, ...CLAIMS_LATIN, ...FAMILIES_LATIN, ...FORMS_LATIN, ...CLAIMS_OTHER, ...FAMILIES_OTHER, ...FORMS_OTHER];

/**
 * Names that hold a claim word without making one, each as one plain word
 * the rules can still name ("endorsed by tonkfun"): the site's and the
 * launchpads Pump.fun and Bonk.fun; Moonshot goes.
 */
const NAMES: ReadonlyArray<readonly [string, string]> = [
  ["tonkfun.fun", " tonkfun "],
  ["pump.fun", " pumpfun "],
  ["bonk.fun", " bonkfun "],
  ["moonshot", " "],
];

/** What ends a clause: a negation never reaches across it. */
const CLAUSE_END = /[.!?;:,。！？；：，、]/u;
/** What ends a sentence: a stop before a space or the end (not a decimal's), a question or exclamation mark, a Chinese or Japanese stop. */
const SENTENCE_END = /[!?。！？]|\.(?=\s|$)/gu;
const BEFORE_WORDS = 6;
const BEFORE_CHARS = 40;
const AFTER_CHARS = 16;
const MAX_LOOKBACK = 200;
/** An answer this short without a negation says yes ("It is.", "Có.", "是。"). */
const SHORT_ANSWER = 2;

/** The text claims are matched in: visible, NFKC, lower case, "ё" as "е", straight apostrophes, a line break as a clause end. */
export function claimText(raw: string): string {
  const lines = raw.replace(/\r\n?|[\n\v\f\u0085\u2028\u2029]/g, " ; ");
  return visibleText(lines.normalize("NFKC"))
    .toLowerCase()
    .replace(/\u0307/g, "")
    .replace(/ё/g, "е")
    .replace(/[\u2018\u2019\u201B\u02BC\u00B4`]/g, "'");
}

/** The last few words before `at`, back to the start of its clause and past the last contrast word. */
function before(text: string, at: number, contrast: RegExp | null): string {
  let start = at;
  while (start > 0 && at - start < MAX_LOOKBACK && !CLAUSE_END.test(text[start - 1])) start -= 1;
  const window = text.slice(start, at).trim().split(" ").slice(-BEFORE_WORDS).join(" ").slice(-BEFORE_CHARS);
  const cut = contrast ? [...window.matchAll(contrast)].pop() : undefined;
  return cut ? window.slice(cut.index + cut[0].length) : window;
}

/** The first few characters after `end`, up to the end of its clause. */
function after(text: string, end: number): string {
  let stop = end;
  while (stop < text.length && stop - end < AFTER_CHARS && !CLAUSE_END.test(text[stop])) stop += 1;
  return text.slice(end, stop);
}

const hasNegation = (text: string, negation: Negation) => (negation.before?.test(text) ?? false) || (negation.after?.test(text) ?? false);

/** Spaced words, and each Chinese, Japanese or Korean character, in an answer's sentence. */
const length = (sentence: string) =>
  sentence.replace(/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/gu, " x ").split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

/** Where the sentence holding `from` ends: the index of its stop, or the text's length. */
function sentenceEnd(text: string, from: number): number {
  SENTENCE_END.lastIndex = from;
  const m = SENTENCE_END.exec(text);
  return m ? m.index : text.length;
}

/** What the reader of a reply sees first: up to its first clause end. */
const firstClause = (reply: string) => reply.split(CLAUSE_END)[0] ?? reply;

/**
 * When the claim ending at `end` is in a question and another sentence
 * answers it: "yes" (a yes-word, a frame such as "Nothing to worry about.",
 * two negations that cancel, or a restatement or short reply with no
 * negation: "It is.") or "no" (a negation: "It is not."); null otherwise.
 */
function answered(text: string, end: number, negation: Negation, frames: Frames, lang: Locale | undefined): "yes" | "no" | null {
  const stop = sentenceEnd(text, end);
  if (!/[?？]/u.test(text[stop] ?? "")) return null;
  const reply = text.slice(stop + 1, sentenceEnd(text, stop + 1) + 1).replace(/^[\s;:,.!?~。！？、，-]+/u, "").trim();
  if (reply === "") return null;
  if (frames.affirm.test(reply)) return "yes";
  // A frame says yes ("No doubt.", "Don't worry, it is.") unless a negation is left beside it ("Don't worry: nothing is guaranteed.").
  const masked = maskFrames(reply, frames);
  if (hasNegation(masked, negation)) return cancels(firstClause(masked), lang) ? "yes" : "no";
  return frames.opensWithIntensifier.test(reply) || frames.restate.test(reply) || length(reply) <= SHORT_ANSWER ? "yes" : null;
}

/** Whether the claim `name` at [start, end) is a disclaimer: denied in its clause (two negations cancel), or a question the answer denies. */
function negated(text: string, masked: string, start: number, end: number, name: ClaimName, negation: Negation, frames: Frames, lang: Locale | undefined): boolean {
  const answer = answered(text, end, negation, frames, lang);
  if (answer !== null) return answer === "no";
  const window = before(masked, start, frames.contrast);
  if (cancels(window, lang)) return false;
  return (negation.before ? denies(window, negation.before, name, lang) : false) || (negation.after?.test(after(masked, end)) ?? false);
}

/**
 * The banned claims in `text`, by English name (never the text itself, so
 * the result is safe to log). `lang` is the text's language, whose negations
 * and frames count; without it, every language's do. `exempt` lists more
 * phrases to ignore, such as the bot's own label and footer when a whole
 * rendered answer is checked.
 */
export function findClaims(text: string, exempt: readonly string[] = [], lang?: Locale): ClaimName[] {
  const negation = lang ? NEGATIONS[lang] : ANY_NEGATION;
  const frames = lang ? FRAMES[lang] : ANY_FRAMES;
  let normalized = claimText(text);
  for (const [name, stand] of NAMES) normalized = normalized.split(name).join(stand);
  for (const phrase of exempt.map(claimText)) {
    if (phrase.trim() !== "") normalized = normalized.split(phrase).join(" ");
  }
  normalized = normalized.replace(/ {2,}/g, " ");
  const masked = maskFrames(normalized, frames);
  const found = new Set<ClaimName>();
  for (const rule of RULES) {
    if (found.has(rule.name)) continue;
    for (const m of normalized.matchAll(rule.re)) {
      if (rule.negatable && negated(normalized, masked, m.index, m.index + m[0].length, rule.name, negation, frames, lang)) continue;
      found.add(rule.name);
      break;
    }
  }
  return [...found];
}
