import { linkSpans } from "./links";
import { fold } from "./names-fold";
import type { RuleInput } from "./rules";
import { isQuestion, plainText } from "./rules-scan";

/**
 * A message read sentence by sentence, for the rules that weigh words by
 * what stands beside them (rules-bait.ts, rules-report.ts): its risky links,
 * strangers' handles and look-alike addresses (its targets) stand as one
 * mark each, allowed links and official handles are blanked, so a link's
 * dots and question marks never split a sentence.
 */

/** Stands in for a target: a risky link, a stranger's handle, a look-alike e-mail address. */
export const TARGET = "";
/** Stands in for an allowed link. */
const ALLOWED = "";

export interface Sentence {
  /** plainText of the sentence, its targets as TARGET. */
  plain: string;
  /** names-fold.ts fold of it: catches look-alike letters, without punctuation. */
  folded: string;
  question: boolean;
  /** It holds a target (every sentence does when a risky link has no place in the text: a hidden-dot spelling or a link button). */
  target: boolean;
  /** It holds an allowed link and no target: what it says is about that link. */
  allowed: boolean;
}

const HANDLE = /(?<![\p{L}\p{N}_@./:])@([a-z][a-z0-9_]{3,31})(?![a-z0-9_])/giu;
/** An ASCII ? between link characters ("claim?ref=1"): a query in a link the scan couldn't place, not a question. */
const QUERY_MARK = /(?<=[A-Za-z0-9/_.%~-])\?(?=[A-Za-z0-9_%=&.~-])/gu;
const ENDS = new Set([..."!?;。！？؟\n"]);
const QUESTION_ENDS = /[?？؟]/u;
/** English asks by inversion ("Is tonkfun-airdrop.xyz the official site"), after a mention, a command or a greeting. */
const INVERTED = /^(?:[@/]\S*\s+|(?:hey|hi|hello|guys|gm|yo|ok|okay|so|and|but|also|btw)[\s,!:]+)*(?:is|are|was|were|isn'?t|aren'?t)\s/iu;
/** At most this many sentences are read: a crafted message can't make the rules slow. */
const SENTENCES_MAX = 200;

/** Splits on ! ? ; and line breaks (any script), and on a dot that ends a word ("Scam. Don't"), never on one inside a number or a name. */
function split(plain: string): Array<{ body: string; end: string }> {
  const out: Array<{ body: string; end: string }> = [];
  let start = 0;
  for (let i = 0; i < plain.length && out.length < SENTENCES_MAX; i++) {
    const c = plain[i];
    const dot = (c === "." || c === "。") && (i + 1 >= plain.length || /\s/u.test(plain[i + 1]) || ENDS.has(plain[i + 1]));
    if (!ENDS.has(c) && !dot) continue;
    let j = i;
    while (j + 1 < plain.length && (ENDS.has(plain[j + 1]) || plain[j + 1] === ".")) j++;
    out.push({ body: plain.slice(start, i), end: plain.slice(i, j + 1) });
    start = j + 1;
    i = j;
  }
  if (start < plain.length && out.length < SENTENCES_MAX) out.push({ body: plain.slice(start), end: "" });
  return out.filter((s) => s.body.trim() !== "");
}

/** The text with its targets marked, allowed links and official handles blanked (same length, so the given spans still fit). */
function marked(input: Pick<RuleInput, "text" | "entities" | "allow" | "bot" | "admins" | "buttons">, emails: ReadonlyArray<[number, number]>): { text: string; spanless: boolean } {
  const { text } = input;
  const chars = text.split("");
  const put = (from: number, to: number, mark: string) => {
    for (let i = from; i < to && i < chars.length; i++) chars[i] = i === from ? mark : " ";
  };
  const links = linkSpans(text, input.entities, input.allow, input.buttons ?? []);
  for (const { span, risky } of links.spans) put(span[0], span[1], risky ? TARGET : ALLOWED);
  for (const [from, to] of emails) put(from, to, TARGET);
  const official = new Set([...input.allow.telegram, ...input.bot, ...input.admins.flatMap((a) => (a.username ? [a.username] : []))].map((n) => n.toLowerCase().replace(/^@/, "")));
  for (const m of text.matchAll(HANDLE)) {
    const from = m.index ?? 0;
    if (chars[from] === "@") put(from, from + m[0].length, official.has(m[1].toLowerCase()) ? " " : TARGET);
  }
  return { text: chars.join("").replace(QUERY_MARK, " "), spanless: links.spanless };
}

/**
 * The message's sentences (see the file's note). `emails`: the spans of
 * look-alike e-mail addresses (rules-emails.ts), which are targets too.
 */
export function readSentences(input: Pick<RuleInput, "text" | "entities" | "allow" | "bot" | "admins" | "buttons">, emails: ReadonlyArray<[number, number]> = []): Sentence[] {
  const { text, spanless } = marked(input, emails);
  return split(plainText(text)).map(({ body, end }) => {
    const plain = `${body}${end}`;
    const question = QUESTION_ENDS.test(end) || isQuestion(plain) || INVERTED.test(body.trim());
    return { plain, folded: fold(plain), question, target: spanless || plain.includes(TARGET), allowed: !plain.includes(TARGET) && plain.includes(ALLOWED) };
  });
}

/** Whether the sentence at `i` holds a target or stands next to one that does. */
export const nearTarget = (sentences: readonly Sentence[], i: number): boolean => [i - 1, i, i + 1].some((j) => sentences[j]?.target === true);
