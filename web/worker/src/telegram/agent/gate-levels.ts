import { claimText } from "./claims";

/**
 * The answer gate's level check (prompts/15-community-agent.md,
 * Guardrails): code writes a token's score line from the tool's data, so a
 * score level (Safe, Caution, Risky in the 12 languages) named within three
 * words of "score" or "level" blocks the answer. Text is normalized as for
 * claims; Chinese and Japanese, written without spaces, count two characters
 * as a word.
 */

/** "score" and "level" in the site's languages; a word that starts with one counts ("scores", "оценка", "puanı"). */
const ANCHORS =
  /(?<![\p{L}\p{M}\p{N}_])(?:score|level|rating|puntuaci[oó]n|puntaje|nivel|n[ií]vel|pontua[cç][aã]o|niveau|stufe|bewertung|punktzahl|оценк|уров|балл|рейтинг|puan|skor|seviye|điểm|xếp hạng|tingkat|peringkat)[\p{L}\p{M}]*|评分|分数|得分|等级|级别|评级|評分|分數|等級|級別|スコア|レベル|評価|점수|등급|레벨/gu;
const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/gu;
const SPACELESS = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;
/** A sentence's end between them: then they aren't beside each other. */
const SENTENCE_END = /[.!?](?:\s|$)|[;。！？]/u;
const MAX_WORDS_BETWEEN = 3;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The level words as one pattern: whole words, but inside running text for Chinese, Japanese and Korean. */
function levelPattern(levelWords: readonly string[]): RegExp | null {
  const parts = [...new Set(levelWords.map((w) => claimText(w).trim()).filter((w) => w !== ""))].map((w) => {
    const body = escapeRegExp(w).replace(/ /g, "\\s+");
    return SPACELESS.test(w) ? body : `(?<![\\p{L}\\p{M}\\p{N}_])${body}(?![\\p{L}\\p{M}\\p{N}_])`;
  });
  return parts.length > 0 ? new RegExp(parts.join("|"), "gu") : null;
}

/** Words in a gap: spaced words with a letter or digit, plus a word per two Chinese or Japanese characters. */
function wordsIn(gap: string): number {
  const cjk = gap.match(CJK)?.length ?? 0;
  const spaced = gap.replace(CJK, " ").split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return spaced + Math.ceil(cjk / 2);
}

interface Span {
  start: number;
  end: number;
}

function beside(text: string, a: Span, b: Span): boolean {
  const [first, second] = a.start <= b.start ? [a, b] : [b, a];
  if (second.start < first.end) return true;
  const gap = text.slice(first.end, second.start);
  return !SENTENCE_END.test(gap) && wordsIn(gap) <= MAX_WORDS_BETWEEN;
}

/** Whether `raw` names a score level beside "score" or "level". */
export function namesLevel(raw: string, levelWords: readonly string[]): boolean {
  const levels = levelPattern(levelWords);
  if (!levels) return false;
  const text = claimText(raw);
  const anchors: Span[] = [...text.matchAll(ANCHORS)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  if (anchors.length === 0) return false;
  for (const m of text.matchAll(levels)) {
    const level = { start: m.index, end: m.index + m[0].length };
    if (anchors.some((anchor) => beside(text, anchor, level))) return true;
  }
  return false;
}
