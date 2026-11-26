/**
 * The answer gate's numbers check (prompts/15-community-agent.md,
 * Guardrails): a number with a unit (%, ETH, $ or USD, x, tokens, or a scale
 * such as K, M, million or 万) must appear with that unit in the facts, the
 * pack and this turn's tool results; any other number of 10 or more must
 * appear there at all. The question is never a source: the facts don't hold
 * it. Values compare by size, so "21.4K" and "21,400" agree and M equals
 * million, and a figure may round the fact to the digits it shows. A unit
 * may follow a hyphen or a Chinese counter ("7-percent", "3个ETH"), "pct"
 * and percentage points are percent, "Ethereum", 以太坊 and イーサ are ETH,
 * and 成 and 割 are tenths (3成 and 3割 are 30%).
 */

export type Unit = "%" | "ETH" | "USD" | "x" | "tokens";

export interface Figure {
  /** With its scale applied ("21.4K" is 21,400); never negative. */
  value: number;
  unit: Unit | null;
  /** Half a step of its last digit, scaled: "21.4K" stands for 21,350 up to 21,450. */
  tolerance: number;
  scaled: boolean;
}

export interface FactIndex {
  figures: Figure[];
  /** Every run of digits, also inside words ("24h", "v4"), for numbers without a unit. */
  loose: number[];
}

/** Addresses, hashes and other long runs of letters and digits hold no figures. */
const OPAQUE = /0[xX][0-9a-fA-F]+|[A-Za-z0-9]{20,}/g;
const SCRIPT = "\\p{sc=Latin}\\p{sc=Cyrillic}\\p{sc=Greek}";
/** Not part of a word ("ERC-20", "v4", "L2") or of a bigger number; thousands with dots, commas or spaces; decimals with a dot or a comma. */
const NUMBER = new RegExp(
  `(?<![${SCRIPT}\\p{N}_]|[${SCRIPT}]-|\\d[.,])(?:\\d{1,3}(?:\\.\\d{3}){2,}(?:,\\d+)?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?: \\d{3})+(?!\\d)|\\d+(?:[.,]\\d+)?)`,
  "gu",
);
const NO_LETTER = `(?![${SCRIPT}])`;

const SCALES: ReadonlyArray<readonly [RegExp, number]> = [
  [new RegExp(`^ ?(?:mil millones|milliards?|billions?|bilh(?:ão|ões|ao|oes)|miliar|milyar|млрд|mrd|tỷ|bn)\\.?${NO_LETTER}`, "iu"), 1e9],
  [/^B(?!\p{L})/u, 1e9],
  [new RegExp(`^ ?(?:millions?|millionen|mill(?:ón|on|ones)|milh(?:ão|ões|ao|oes)|mio|млн|milyon|triệu|juta|mln)\\.?${NO_LETTER}`, "iu"), 1e6],
  [/^M(?!\p{L})/u, 1e6],
  [new RegExp(`^ ?(?:thousand|mil|тыс|bin|nghìn|ngàn|ribu)\\.?${NO_LETTER}`, "iu"), 1e3],
  [/^[Kk](?!\p{L})/u, 1e3],
  [/^ ?(?:十亿|十億)/u, 1e9],
  [/^ ?(?:亿|億|억)/u, 1e8],
  [/^ ?(?:百万|百萬)/u, 1e6],
  [/^ ?(?:万|萬|만)/u, 1e4],
  [/^ ?(?:千|천)/u, 1e3],
];

/** What may stand between a figure and its unit: a space, a hyphen ("7-percent") or a Chinese counter ("3个ETH"). */
const SEP = "(?:\\s?[-\u2010\u2011]\\s?|\\s?[个個]\\s?|\\s)?";

/** A unit right after a number ("5 %", "0.042 ETH", "10 million tokens" once the scale is read), each from the start of the rest. */
export const UNITS_AFTER: ReadonlyArray<readonly [RegExp, Unit]> = [
  [new RegExp(`^${SEP}(?:[%٪]|(?:percent|per cent|pct|percentage points?|por ciento|por cento|pour ?cent|prozent|процент\\p{L}*|phần trăm|persen)${NO_LETTER}|パーセント|퍼센트|百分点|百分點)`, "iu"), "%"],
  [new RegExp(`^${SEP}(?:(?:eth|ether|ethereum)${NO_LETTER}|以太坊|以太币|以太幣|イーサ(?:リアム)?|이더(?:리움)?)`, "iu"), "ETH"],
  [new RegExp(`^${SEP}(?:(?:usd|us\\$|dollars?|d[oó]lar(?:es)?|долл\\p{L}*|đô la)${NO_LETTER}|\\$|美元|ドル|달러)`, "iu"), "USD"],
  [/^[xх×](?![\p{L}\p{N}])/u, "x"],
  [new RegExp(`^${SEP}(?:de )?(?:(?:tokens?|jetons?|токен\\p{L}*)${NO_LETTER}|代币|代幣|トークン|토큰)`, "iu"), "tokens"],
];

/** 成 and 割 after a number: tenths ("三成", "3割" are 30%), never a word they begin (成本, 成功). */
const TENTHS = /^ ?[成割](?:(?=的)|(?!\p{sc=Han}))/u;

/** The unit `rest` (what follows a figure) opens with, and the factor its value takes (10 for tenths); null without one. */
export function unitAfter(rest: string): { unit: Unit; factor: number } | null {
  if (TENTHS.test(rest)) return { unit: "%", factor: 10 };
  const unit = UNITS_AFTER.find(([re]) => re.test(rest))?.[1];
  return unit ? { unit, factor: 1 } : null;
}

/** A unit right before a number ("$21.4K", "yüzde 5"), each at the end of what comes before. */
export const UNITS_BEFORE: ReadonlyArray<readonly [RegExp, Unit]> = [
  [/(?:US)?\$ ?$/u, "USD"],
  [/(?:[%٪]|yüzde) ?$/iu, "%"],
];

/** In a tool's JSON, a key names the unit: "marketCapUsd": 21400, "curvePct": 41. */
const JSON_KEY = /"([A-Za-z0-9_]+)"\s*:\s*-?$/;

function keyUnit(before: string): Unit | null {
  const key = JSON_KEY.exec(before)?.[1] ?? "";
  if (/usd/i.test(key)) return "USD";
  if (/pct|percent|change/i.test(key)) return "%";
  if (/eth/i.test(key)) return "ETH";
  if (/tokens|supply/i.test(key)) return "tokens";
  return null;
}

/** "1,073,000,000", "1.073.000.000", "0,042", "1 000" and "21.4" as values, with the decimals shown. */
function parseValue(raw: string): { value: number; decimals: number } {
  const s = raw.replace(/ /g, "");
  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;
  let mark: "." | "," | null = null;
  if (dots > 1) mark = commas > 0 ? "," : null;
  else if (commas > 1) mark = dots > 0 ? "." : null;
  else if (dots === 1 && commas === 1) mark = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else if (dots === 1) mark = ".";
  else if (commas === 1) mark = /^0,|,\d{1,2}$|,\d{4,}$/.test(s) ? "," : null;
  const at = mark ? s.lastIndexOf(mark) : s.length;
  const whole = s.slice(0, at).replace(/[.,]/g, "");
  const fraction = mark ? s.slice(at + 1) : "";
  return { value: Number(`${whole || "0"}.${fraction || "0"}`), decimals: fraction.length };
}

/** Every figure in `text`; `keyed` also reads units from JSON keys (the tools' results). */
export function figuresIn(text: string, keyed = false): Figure[] {
  const masked = text.replace(OPAQUE, " ");
  const out: Figure[] = [];
  for (const m of masked.matchAll(NUMBER)) {
    const { value, decimals } = parseValue(m[0]);
    const end = m.index + m[0].length;
    let rest = masked.slice(end, end + 32);
    let scale = 1;
    for (const [re, factor] of SCALES) {
      const found = re.exec(rest);
      if (!found) continue;
      scale = factor;
      rest = rest.slice(found[0].length);
      break;
    }
    const before = masked.slice(Math.max(0, m.index - 48), m.index);
    const after = unitAfter(rest);
    const unit = after?.unit ?? UNITS_BEFORE.find(([re]) => re.test(before))?.[1] ?? (keyed ? keyUnit(before) : null);
    const factor = scale * (after?.factor ?? 1);
    out.push({ value: value * factor, unit, tolerance: 0.5 * 10 ** -decimals * factor, scaled: scale !== 1 });
  }
  return out;
}

export function indexFacts(facts: string): FactIndex {
  const loose = [...facts.replace(OPAQUE, " ").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { figures: figuresIn(facts, true), loose };
}

/** The answer's figures the facts don't back. A number under 10 without a unit is never checked ("2 blocks"). */
export function unsupportedFigures(answer: string, facts: FactIndex): Figure[] {
  return figuresIn(answer).filter((f) => {
    if (f.unit === null && !f.scaled && f.value < 10) return false;
    const close = (value: number) => Math.abs(value - f.value) < f.tolerance - 1e-12 * Math.max(1, f.value);
    if (f.unit !== null) return !facts.figures.some((g) => g.unit === f.unit && close(g.value));
    return !(facts.figures.some((g) => close(g.value)) || (!f.scaled && facts.loose.some(close)));
  });
}
