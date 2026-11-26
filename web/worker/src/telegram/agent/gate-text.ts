import { visibleText } from "../../text";
import { KEPT_NAMES } from "./gate-hidden";

/**
 * The answer gate's text steps (agent/gate.ts): the model's words made
 * plain and inert. Telegram turns URLs, bare domains, e-mails, @mentions,
 * #hashtags, $cashtags and /commands into live entities by itself, so they
 * go; a dot inside a word becomes a middle dot, so no host is left to tap
 * (the bridge LI.FI reads LI·FI); and a long answer is cut at a sentence end.
 */

const LINE_BREAKS = /\r\n?|[\v\f\u0085\u2028\u2029]/g;
/** Runs between the Chinese and Japanese commas, stops and brackets NFKC would make ASCII: those can't build a link, so they keep their own form. */
const NOT_CJK_PUNCTUATION = /[^\uff0c\uff01\uff1f\uff1b\uff08\uff09]+/g;
const ANY_DIGIT = /\p{Nd}/gu;
const IS_DIGIT = /\p{Nd}/u;

/** A digit of any script as its ASCII digit: Unicode's decimal digits come in runs of ten from zero, so a digit's value is its place in its run. */
function asciiDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 48;
  if (code <= 57) return digit;
  let start = code;
  while (start > code - 60 && IS_DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return String((code - start) % 10);
}

/**
 * NFKC (full-width letters, digits and symbols, one-dot leaders and other
 * look-alike dots as ASCII; Chinese commas and stops keep their form),
 * every script's digits as ASCII, invisible and right-to-left characters
 * dropped on each line, and line breaks kept, with at most one blank line in
 * a row.
 */
export function plainLines(raw: string): string {
  const normalized = raw.replace(NOT_CJK_PUNCTUATION, (run) => run.normalize("NFKC"));
  const lines = normalized.replace(ANY_DIGIT, asciiDigit).replace(LINE_BREAKS, "\n").split("\n").map(visibleText);
  const kept: string[] = [];
  for (const line of lines) if (line !== "" || (kept.length > 0 && kept[kept.length - 1] !== "")) kept.push(line);
  return kept.join("\n").trim();
}

/** A URL with a scheme (https://, hxxp://, tg://), or a scheme that opens an app or a wallet. */
const SCHEMED = /(?<![\p{L}\p{N}])(?:[a-z][a-z0-9+.-]{1,30}:\/\/\S*|(?:tg|ton|mailto|javascript|data|intent|sms|tel|ethereum|solana|bitcoin|wc):\S+)/giu;
const WWW = /(?<![\p{L}\p{N}])www\d{0,3}\.\S*/giu;
/** An e-mail address, from the start of its run of characters (so a long run is read once). */
const EMAIL = /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@(?:[\p{sc=Latin}\p{sc=Cyrillic}\p{N}-]+\.)+[\p{sc=Latin}\p{sc=Cyrillic}]{2,}/giu;
/** Letters a host name is made of (not Chinese or Japanese, so a name glued to them is still found); their dots go below. */
const HOST = "\\p{sc=Latin}\\p{sc=Cyrillic}\\p{sc=Greek}";
const LABEL = `[${HOST}\\p{N}\\p{M}_-]`;
/** A bare domain (claim.example.xyz, t.me/group), with any path after it. */
const DOMAIN = new RegExp(`(?<!${LABEL}|[.@])(?:[${HOST}\\p{N}]${LABEL}*\\.)+[${HOST}]{2,63}(?!${LABEL})(?:/\\S*)?`, "gu");
const COMMAND = /(?<![\p{L}\p{N}_/])\/([a-z0-9_]{1,32})(?:@[a-z0-9_]+)?/giu;
/** The bot's own commands stay: "/check and its address" is how a member gets a token's card. */
const OWN_COMMANDS: ReadonlySet<string> = new Set(["ask", "check", "launches", "referral", "help", "rules", "report", "start"]);
const MENTION = /(?<![\p{L}\p{N}_])@[a-z0-9_]+/giu;
const HASHTAG = /#(?=[\p{L}\p{N}_])/gu;
const CASHTAG = /\$(?=\p{L})/gu;

/** Spaces collapsed and trimmed on each line; none left before a stop, a comma or a closing bracket where a link was ("visit ." → "visit."). French spaces before ! ? : ; stay. */
export function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").replace(/ +([.,)])/g, "$1").replace(/\( +/g, "(").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every URL, bare domain (but tonkfun.fun, Pump.fun, Bonk.fun and LI.FI, written bare), e-mail, tg:// link and @mention removed; # and $ before a word dropped; other bots' /commands lose their slash. */
export function stripLinks(text: string): string {
  const out = text
    .replace(SCHEMED, " ")
    .replace(WWW, " ")
    .replace(EMAIL, " ")
    .replace(DOMAIN, (domain) => (KEPT_NAMES.has(domain.toLowerCase()) ? domain : " "))
    .replace(COMMAND, (_command, name: string) => (OWN_COMMANDS.has(name.toLowerCase()) ? `/${name.toLowerCase()}` : name))
    .replace(MENTION, " ")
    .replace(HASHTAG, "")
    .replace(CASHTAG, "");
  return tidy(out);
}

/** The kept names as whole host names; Chinese or Japanese glued to them ("访问tonkfun.fun了解") isn't part of a host. */
const KEPT_NAME = new RegExp(`(?<!${LABEL}|\\.)(?:tonkfun|pump|bonk)\\.fun(?!${LABEL})`, "giu");
/** A dot that leads on into a word, past any run of dots ("evil.com", "a...b"); a sentence's last dot stays. */
const INNER_DOT = /\.(?=\.*[\p{L}\p{N}\p{M}_-])/gu;

/** Digits joined by dots: a decimal has one dot (0.042, 1.5); more make a version or an address (1.2.3.4). */
const DOTTED_DIGITS = /(?<![\d.])\d+(?:\.\d+)+/g;

/** Every dot inside a word as a middle dot ("claim·evil·xyz"), but decimals and tonkfun.fun, Pump.fun and Bonk.fun; an ideographic full stop before a Latin letter or digit too. */
export function middleDots(text: string): string {
  const kept = new Set<number>();
  for (const m of text.matchAll(KEPT_NAME)) kept.add(m.index + m[0].indexOf("."));
  for (const m of text.matchAll(DOTTED_DIGITS)) if (m[0].split(".").length === 2) kept.add(m.index + m[0].indexOf("."));
  return text.replace(INNER_DOT, (dot, at: number) => (kept.has(at) ? dot : "·")).replace(/。(?=[A-Za-z0-9])/g, "·");
}

/** Where a sentence ends: its stop followed by a space, a Chinese or Japanese stop, or a line break. */
const SENTENCE_END = /[.!?](?=\s)|[。！？]|\n/gu;

/** At most `max` characters, cut at the last sentence end that keeps most of it, else at a word with "…". */
export function clipAtSentence(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max).join("");
  let cut = /[.!?]$/.test(head) && /\s/.test(chars[max]) ? head.length : 0;
  for (const m of head.matchAll(SENTENCE_END)) cut = Math.max(cut, m.index + m[0].length);
  if (cut >= head.length * 0.4) return head.slice(0, cut).trimEnd();
  const shorter = chars.slice(0, max - 1).join("");
  const space = shorter.search(/\s\S*$/);
  return `${(space > shorter.length * 0.6 ? shorter.slice(0, space) : shorter).trimEnd()}…`;
}
