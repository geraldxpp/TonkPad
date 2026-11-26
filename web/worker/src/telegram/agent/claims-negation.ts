import type { Locale } from "@/shared/i18n/config";
import { words } from "./claims-rule";

/**
 * Each language's negations, which turn a claim close by in the same clause
 * into a disclaimer (agent/claims.ts): before it in most languages
 * ("nothing is guaranteed", "nada está garantizado", "不保证"), after it in
 * Japanese, Korean and Turkish ("保証されていません", "보장되지 않습니다",
 * "garanti değildir"), and a question's ending after it in Chinese and
 * Vietnamese. Kept per language: Portuguese "no" means "in the".
 */
export interface Negation {
  before: RegExp | null;
  after: RegExp | null;
}

/** Whole words, without the global flag: test() keeps no state. */
const spaced = (source: string) => new RegExp(words(source).source, "u");

export const NEGATIONS: Record<Locale, Negation> = {
  en: { before: spaced("not|no|never|nothing|nobody|none|neither|nor|without|cannot|whether|\\p{L}+n't"), after: null },
  es: { before: spaced("no|nunca|jam[aá]s|nada|nadie|ning[uú]n[oa]?|ni|sin|tampoco"), after: null },
  pt: { before: spaced("n[aã]o|nunca|jamais|nada|ningu[eé]m|nenhuma?|nem|sem"), after: null },
  fr: { before: spaced("ne|n'\\p{L}*|pas|jamais|rien|aucune?|sans|ni"), after: null },
  de: { before: spaced("nicht|kein(?:e|en|em|er|es)?|nie|niemals|nichts|ohne|weder|ob"), after: null },
  // "как" and "чтобы" too: "как безопасно покупать" is "how to buy safely", not "it is safe to buy".
  ru: { before: spaced("не|нет|ни|никогда|ничего|ничто|никто|никак\\p{L}*|без|нельзя|вряд|как|чтобы"), after: null },
  tr: { before: spaced("asla|hiç|hiçbir"), after: /değil|yok|\p{L}m[ae](?:z|m|y[ıi]z|d[ıi])(?!\p{L})/u },
  vi: { before: spaced("không|chưa|chẳng|chả|đừng|liệu"), after: spaced("không") },
  id: { before: spaced("tidak|tak|bukan|belum|tanpa|jangan|apakah"), after: null },
  zh: { before: /不(?![过過少同久断斷但仅僅然如错錯])|无(?![论論])|無(?!論)|非(?!常)|未(?![来來])|没|沒|别(?!人)|別(?!人)|否(?![则則])/u, after: /吗|嗎/u },
  ja: { before: null, after: /ない|ません|かどうか/u },
  ko: { before: spaced("안|못"), after: /않|없|아니|못|인지/u },
};

const anyOf = (patterns: ReadonlyArray<RegExp | null>) =>
  new RegExp(patterns.flatMap((re) => (re ? [`(?:${re.source})`] : [])).join("|"), "u");

/** Every language's negations at once, for text whose language isn't known. */
export const ANY_NEGATION: Negation = {
  before: anyOf(Object.values(NEGATIONS).map((n) => n.before)),
  after: anyOf(Object.values(NEGATIONS).map((n) => n.after)),
};
