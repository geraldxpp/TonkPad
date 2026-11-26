import { stripLinks } from "./links";
import { compact, fold } from "./names-fold";
import type { RuleInput } from "./rules";
import { plainText } from "./rules-scan";
import { isRequest } from "./rules-solicit-request";
import { EMAIL } from "./secrets-contacts";
import { DRAINER_BAIT, matchesAny, NEGATED_AFTER, NEGATED_BEFORE, SOLICIT, SOLICIT_ATTRIBUTION, SOLICIT_BAIT, SOLICIT_SUPPORT, SUPPORT_WORDS } from "./words";

/**
 * Asking to be messaged privately ("DM me", "contact @x"), read in context
 * (prompts/15-community-agent.md, "DM me" and fake support). A solicitation
 * right after a negation is none ("don't DM me", "never message us"; a
 * German one after the verb too, unless "sondern" or "aber" follows:
 * "schreib mir nicht hier, sondern privat" still asks), nor is an e-mail
 * address, the Security contact's included. One that asks for help
 * (rules-solicit-request.ts: the team addressed, or inside a request) is a
 * help request, never the author's own. One that is quoted, or follows a
 * reporting verb ("he wrote 'DM me'", "Got a message: contact @x"), is
 * someone else's words when the message reports a scam; otherwise it is the
 * author's own. One of the author's own is rule-certain as an offer of
 * support (a support, help, admin, team or mod word inside it or after it in
 * its sentence, or in a question right before it: "Need help? DM me") or
 * beside bait in its sentence ("DM me to claim your airdrop", "请私信我领取空投"),
 * in a sentence that isn't itself a question.
 */
export interface Solicitation {
  /** The author asks to be messaged privately: never waived by report words. */
  own: boolean;
  /** One of the author's own is an offer of support, or carries bait: rule-certain fake support. */
  certain: boolean;
  /** Someone else's solicitation, quoted or reported in a report. */
  quoted: boolean;
  /** A member asking the team, or anyone, to message them for help: kept, with the DM-safety warning. */
  request: boolean;
}

/** At most this many solicitations are weighed per message (each reads only its own sentence). */
const MAX_MATCHES = 16;
const SENTENCE_ENDS = new Set([..."\n.!?;:。！？；："]);
/** Sentence ends without the colon: "Mods: contact me" addresses the mods in the solicitation's own sentence. */
const STOPS = new Set([..."\n.!?;。！？；"]);
const CLAUSE_ENDS = new Set([...SENTENCE_ENDS, ..."，、,"]);
const QUESTION_MARKS = new Set([..."?？؟"]);
const QUOTES = new Set([...'"“”«»„「」『』']);
const COLONS = new Set([...":："]);
const MENTION = /@([a-z][a-z0-9_]{3,31})(?![a-z0-9_])/gu;
const HANDLES = /@([a-z][a-z0-9_]{3,31})/gu;
const GLOBAL = SOLICIT.map((r) => new RegExp(r.source, `${r.flags}g`));
/** "sondern" or "aber" after a German negation: what is denied is only where to write ("nicht hier, sondern privat"). */
const BUT = /(?<![\p{L}\p{N}_])(?:sondern|aber)(?![\p{L}\p{N}_])/iu;
/** A negation is looked for this far back at most. */
const LEAD = 80;

const blank = (part: string) => " ".repeat(part.length);
const letter = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * The text solicitations are read in: e-mail addresses (Telegram's marks and
 * any address-shaped run) and links blanked, then plainText, then the
 * official accounts', the bot's and admins' @usernames blanked ("talk to
 * @alex_admin" asks nobody to message a stranger).
 */
function solicitText(input: Pick<RuleInput, "text" | "entities" | "allow" | "bot" | "admins">): string {
  const chars = input.text.split("");
  for (const { type, offset, length } of input.entities) {
    if (type !== "email" || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0) continue;
    for (let i = offset; i < offset + length && i < chars.length; i++) chars[i] = " ";
  }
  const plain = plainText(stripLinks(chars.join(""), input.entities).replace(EMAIL, blank));
  const official = new Set([...input.allow.telegram, ...input.bot, ...input.admins.flatMap((a) => (a.username ? [a.username] : []))].map((n) => n.toLowerCase().replace(/^@/, "")));
  return plain.replace(MENTION, (mention, name: string) => (official.has(name) ? blank(mention) : mention));
}

/** Where the run of text holding text[from..to) starts and ends: the nearest of `ends` before it, and the first at or after `to`. */
function around(text: string, from: number, to: number, ends: ReadonlySet<string>): [number, number] {
  let start = from;
  while (start > 0 && !ends.has(text[start - 1])) start--;
  let end = to;
  while (end < text.length && !ends.has(text[end])) end++;
  return [start, end];
}

/** An odd number of quotation marks before `at` in its sentence: the solicitation is inside a quote. An apostrophe counts only beside a space or a sign, never inside a word ("don't"). */
function quotedAt(text: string, start: number, at: number): boolean {
  let marks = 0;
  for (let i = start; i < at; i++) {
    const c = text[i];
    if (QUOTES.has(c) || (c === "'" && !(letter(text[i - 1]) && letter(text[i + 1])))) marks++;
  }
  return marks % 2 === 1;
}

/** A reporting verb before the solicitation in its sentence, or in the sentence before when that one introduces it with a colon. */
function attributed(text: string, sentence: number, start: number): boolean {
  if (matchesAny(SOLICIT_ATTRIBUTION, text.slice(sentence, start))) return true;
  if (sentence === 0 || !COLONS.has(text[sentence - 1])) return false;
  const [before] = around(text, sentence - 1, sentence - 1, SENTENCE_ENDS);
  return matchesAny(SOLICIT_ATTRIBUTION, text.slice(before, sentence));
}

/** A support handle inside the solicitation ("contact @TonkfunHelpDesk"). */
const supportHandle = (match: string) => [...match.matchAll(HANDLES)].some(([, u]) => matchesAny(SUPPORT_WORDS, fold(u), compact(u)));

/** Whether a solicitation of the author's own is rule-certain (see the file's note). */
function certainAt(text: string, start: number, end: number): boolean {
  const [from, to] = around(text, start, end, SENTENCE_ENDS);
  if (QUESTION_MARKS.has(text[to])) return false;
  const sentence = text.slice(from, to);
  if (matchesAny(SOLICIT_SUPPORT, text.slice(start, to)) || supportHandle(text.slice(start, end)) || matchesAny(SOLICIT_BAIT, sentence) || matchesAny(DRAINER_BAIT, sentence)) return true;
  // "Need help? DM me": the question right before it says what is offered.
  if (from === 0 || !QUESTION_MARKS.has(text[from - 1])) return false;
  const [before] = around(text, from - 1, from - 1, SENTENCE_ENDS);
  const question = text.slice(before, from);
  return matchesAny(SOLICIT_SUPPORT, question) || matchesAny(SOLICIT_BAIT, question);
}

/** A negation cancels the solicitation: just before it in its clause, or (German) just after it, unless "sondern" or "aber" follows. */
function negated(text: string, start: number, end: number): boolean {
  const [clause, clauseEnd] = around(text, start, end, CLAUSE_ENDS);
  if (matchesAny(NEGATED_BEFORE, text.slice(Math.max(clause, start - LEAD), start))) return true;
  const after = text.slice(end, clauseEnd);
  return matchesAny(NEGATED_AFTER, after) && !BUT.test(after);
}

/** The message's solicitations, weighed (see the file's note). `reports`: the message holds report words, so quoted or attributed words are someone else's. */
export function readSolicitation(input: Pick<RuleInput, "text" | "entities" | "allow" | "bot" | "admins">, reports = true): Solicitation {
  const text = solicitText(input);
  const result: Solicitation = { own: false, certain: false, quoted: false, request: false };
  let weighed = 0;
  for (const pattern of GLOBAL) {
    for (const m of text.matchAll(pattern)) {
      if (++weighed > MAX_MATCHES || (result.own && result.certain)) return result;
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (negated(text, start, end)) continue;
      const [sentence, sentenceEnd] = around(text, start, end, SENTENCE_ENDS);
      if (reports && (attributed(text, sentence, start) || quotedAt(text, sentence, start))) {
        result.quoted = true;
        continue;
      }
      const [, clauseEnd] = around(text, start, end, CLAUSE_ENDS);
      const [opening] = around(text, start, end, STOPS);
      if (isRequest({ before: text.slice(opening, start), clauseAfter: text.slice(end, clauseEnd), sentenceAfter: text.slice(clauseEnd, sentenceEnd) })) {
        result.request = true;
        continue;
      }
      result.own = true;
      if (certainAt(text, start, end)) result.certain = true;
    }
  }
  return result;
}
