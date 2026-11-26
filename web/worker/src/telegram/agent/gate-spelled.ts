import { type Locale, LOCALES } from "@/shared/i18n/config";
import { type Unit, unitAfter as unitOf, UNITS_BEFORE } from "./gate-numbers";
import { foreignOnly, type Lexicon, LEXICONS, type NumberWord } from "./gate-spelled-words";

/**
 * Figures written in words for the numbers check (agent/gate-numbers.ts),
 * so "five percent", "zwei ETH", "百分之五" and "五パーセント" are checked
 * like "5%" (prompts/15-community-agent.md, Guardrails). Only number words
 * beside a unit are read: the answer's own language's words first, then
 * every other language's (answers#10: an English answer the model labelled
 * German is still read), Chinese and Japanese numerals and Korean ones in
 * any answer. Another language's word that is also an everyday word in
 * many ("on", "once", "un") is read only in its own language's answers.
 * Before "tokens" a scale must stand too ("ten million tokens"), since "a
 * token" is "un token", "ein Token", "bir token" or "一个代币". A figure it
 * can't read for certain ("five two percent") makes the answer uncertain,
 * and the gate blocks it. Only the checked copy changes: members read the
 * words.
 */

export interface Spelled {
  /** The text with each figure in words as digits. */
  text: string;
  /** A unit stands beside number words that don't read as one figure. */
  uncertain: boolean;
}

const HAN_DIGITS: Readonly<Record<string, number>> = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const HAN_UNITS: Readonly<Record<string, number>> = { 十: 10, 百: 100, 千: 1000 };
const SINO_DIGITS: Readonly<Record<string, number>> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const SINO_UNITS: Readonly<Record<string, number>> = { 십: 10, 백: 100, 천: 1000 };

/** 百分之 and a number, in numerals or digits ("百分之五", "百分之2", "百分之零点五"). */
const PERCENT_OF = /百分之([〇零一二两兩三四五六七八九十百千]+(?:[点點][〇零一二三四五六七八九]+)?|\d+(?:\.\d+)?)/gu;
const HAN_RUN = /[〇零一二两兩三四五六七八九十百千]+/gu;
const SINO_RUN = /(?<![\p{L}\p{N}])[일이삼사오육칠팔구십백천]+/gu;
/** A CJK scale between a numeral and its unit ("一千万代币"): left for the numbers check, which reads it. */
const CJK_SCALE = /^ ?[万萬亿億만억]/u;
const LETTER_OR_DIGIT = "[\\p{L}\\p{N}]";

/** Chinese, Japanese or Sino-Korean numerals as a value ("九十九" 99, "一百零五" 105), or null when they don't read as one. */
function numerals(run: string, digits: Readonly<Record<string, number>>, units: Readonly<Record<string, number>>): number | null {
  const chars = [...run];
  if (chars.length === 1 && digits[chars[0]] === 0) return 0;
  let total = 0;
  let digit: number | null = null;
  let last = Number.POSITIVE_INFINITY;
  for (const c of chars) {
    if (digits[c] === 0) continue;
    if (digits[c] !== undefined) {
      if (digit !== null) return null;
      digit = digits[c];
      continue;
    }
    const unit = units[c];
    if (unit === undefined || unit >= last) return null;
    total += (digit ?? 1) * unit;
    digit = null;
    last = unit;
  }
  return total + (digit ?? 0);
}

type Kind = "none" | "unit" | "teen" | "tens" | "hundred" | "scale";

/** Number words as a value ("twenty-five" 25, "quatre-vingt-dix-neuf" 99, "hai mươi lăm" 25), or null when they don't read as one ("five two"). */
export function wordsValue(values: readonly NumberWord[], lex: Lexicon): number | null {
  if (values.length === 1 && (values[0] === 0 || values[0] === 0.5)) return values[0];
  let total = 0;
  let current = 0;
  let last: Kind = "none";
  for (const v of values) {
    if (v === "tens" || v === "teen") {
      if (last !== "unit") return null;
      current += v === "tens" ? (current % 10) * 9 : 10;
      last = v === "tens" ? "tens" : "teen";
    } else if (v === 0 || v === 0.5) {
      if (last !== "hundred" && last !== "scale") return null;
    } else if (v >= 1000) {
      total += (current || 1) * v;
      current = 0;
      last = "scale";
    } else if (v === 100) {
      if (current >= 100 || last === "teen" || last === "tens") return null;
      current = (current || 1) * 100;
      last = "hundred";
    } else if (v >= 20 || (v === 10 && lex.tenTakesUnit)) {
      if (last === "unit" || last === "teen" || last === "tens") return null;
      current += v;
      last = "tens";
    } else if (v >= 10) {
      const frenchTeen = lex.frenchTeens && last === "tens" && [60, 80].includes(current % 100);
      if (last === "unit" || last === "teen" || (last === "tens" && !frenchTeen)) return null;
      current += v;
      last = "teen";
    } else {
      if (last === "unit" || last === "teen") return null;
      current += v;
      last = "unit";
    }
  }
  return total + current;
}

const unitAfter = (rest: string): Unit | null => unitOf(rest)?.unit ?? null;
const unitBefore = (before: string): Unit | null => UNITS_BEFORE.find(([re]) => re.test(before))?.[1] ?? null;
const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");

/** The unit a figure at [at, end) of `text` stands beside, and whether a CJK scale sits between; null without one, or for "tokens" with no scale. */
function unitBeside(text: string, at: number, end: number, scaled: boolean): Unit | null {
  let rest = text.slice(end, end + 32);
  const scale = CJK_SCALE.exec(rest);
  if (scale) rest = rest.slice(scale[0].length);
  const unit = unitAfter(rest) ?? unitBefore(text.slice(Math.max(0, at - 48), at));
  return unit === "tokens" && !scaled && !scale ? null : unit;
}

function phraseOf(lex: Lexicon): { phrase: RegExp; word: RegExp } {
  const words = [...lex.words.keys()].sort((a, b) => b.length - a.length).map(escape).join("|");
  return {
    phrase: new RegExp(`(?<!${LETTER_OR_DIGIT})(?:${words})(?:${lex.join}(?:${words}))*(?!${LETTER_OR_DIGIT})`, "giu"),
    word: new RegExp(`(?<!${LETTER_OR_DIGIT})(?:${words})(?!${LETTER_OR_DIGIT})`, "giu"),
  };
}

const PHRASES = new Map<Lexicon, { phrase: RegExp; word: RegExp }>();

/** Figures as digits beside their units; `doubt` hears of each that can't be read. */
function convert(text: string, lang: Locale, doubt: () => void): string {
  let out = text.replace(PERCENT_OF, (all: string, raw: string) => {
    const [whole, fraction] = raw.split(/[点點]/u);
    const value = /^\d/.test(whole) ? Number(whole) : numerals(whole, HAN_DIGITS, HAN_UNITS);
    if (value === null) {
      doubt();
      return all;
    }
    const decimals = fraction ? `.${[...fraction].map((c) => HAN_DIGITS[c]).join("")}` : "";
    return `${value}${decimals}%`;
  });
  const numeralsBeside = (run: RegExp, digits: Readonly<Record<string, number>>, units: Readonly<Record<string, number>>) => {
    const source = out;
    out = source.replace(run, (all: string, at: number) => {
      if (unitBeside(source, at, at + all.length, false) === null) return all;
      const value = numerals(all, digits, units);
      if (value === null) doubt();
      return value === null ? all : String(value);
    });
  };
  numeralsBeside(HAN_RUN, HAN_DIGITS, HAN_UNITS);
  numeralsBeside(SINO_RUN, SINO_DIGITS, SINO_UNITS);
  out = wordsBeside(out, LEXICONS[lang], false, doubt);
  for (const other of LOCALES) if (other.code !== lang) out = wordsBeside(out, LEXICONS[other.code], true, doubt);
  return out;
}

/** One language's number words beside a unit, as digits; `foreign` when it isn't the answer's own language. */
function wordsBeside(source: string, lex: Lexicon | undefined, foreign: boolean, doubt: () => void): string {
  if (!lex) return source;
  const { phrase, word } = PHRASES.get(lex) ?? phraseOf(lex);
  PHRASES.set(lex, { phrase, word });
  return source.replace(phrase, (all: string, at: number) => {
    const words = [...all.matchAll(word)].map((m) => m[0].toLowerCase().replace(/\s+/g, " "));
    if (foreign && words.length === 1 && foreignOnly(words[0])) return all;
    const values = words.map((w) => lex.words.get(w) ?? Number.NaN);
    const scaled = values.some((v) => typeof v === "number" && v >= 1000);
    if (unitBeside(source, at, at + all.length, scaled) === null) return all;
    const value = values.some((v) => typeof v === "number" && Number.isNaN(v)) ? null : wordsValue(values, lex);
    if (value === null) doubt();
    return value === null ? all : String(value);
  });
}

/** `text` with its figures in words as digits, for the numbers check only, and whether one couldn't be read. */
export function spelledFigures(text: string, lang: Locale): Spelled {
  let uncertain = false;
  const converted = convert(text, lang, () => {
    uncertain = true;
  });
  return { text: converted, uncertain };
}
