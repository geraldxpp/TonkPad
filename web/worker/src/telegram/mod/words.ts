import type { Locale } from "@/shared/i18n/config";
import { ABUSE_WORDS } from "./words-abuse";
import { BAIT, BAIT_MARKERS, MARKED_BAIT, OPENING_BAIT } from "./words-bait";
import { CONTEXT_WORDS, type ContextWords } from "./words-context";
import { LATIN } from "./words-latin";
import { DRAINER_NAME_SOURCES, SUPPORT_SOURCES } from "./words-latin-names";
import { DEMONSTRATIVES, LEGIT_WORDS, type LegitWords, OPENING_PROMO } from "./words-legit";
import { OTHER } from "./words-other";
import { SOLICIT_WORDS, type SolicitWords } from "./words-solicit";

/**
 * The moderation rules' word lists in the site's 12 languages, compiled
 * once. The lists themselves are data: words-latin.ts (en, es, pt, fr, de,
 * tr, vi, id), words-other.ts (ru, zh, ja, ko), words-bait.ts (imperative
 * drainer bait), words-context.ts (who is speaking in a sentence),
 * words-legit.ts (asking whether a link is real, and vouching for one),
 * words-solicit.ts (what stands around a "DM me") and words-abuse.ts (slurs,
 * threats and self-harm phrases, which the owner reviews).
 *
 * Each pattern entry is a regular-expression source in which a space stands
 * for any run of spaces. Entries in spaced scripts match whole words only
 * (JavaScript's \b knows only ASCII letters, so the edges are checked with
 * Unicode classes); entries holding Chinese, Japanese or Korean match
 * anywhere, since those scripts put no spaces between words.
 */
export interface WordSet {
  /** Words or phrases that open a question, matched at the start of a sentence (Chinese, Japanese and Korean anywhere). Plain text. */
  question: readonly string[];
  /** Asking to be messaged privately: "DM me", "contact @x". */
  solicit: readonly string[];
  /** Mentions of private messages. */
  dm: readonly string[];
  /** Drainer words, bare nouns included (airdrop, whitelist, presale): what a scam warning or a hidden token name looks for. Imperative bait is words-bait.ts. */
  drainer: readonly string[];
  /** Asking for help, or money trouble. */
  help: readonly string[];
  /** Reporting or asking about a scam. */
  report: readonly string[];
  /** Flaw reports. */
  security: readonly string[];
  /** Words for a private key or a recovery phrase. */
  key: readonly string[];
  /** Role words in a display name ("Support", "Help Desk"). Plain text, compared after names.ts fold. */
  role: readonly string[];
}

/** One language's slurs and threats, and its strong and weak self-harm phrases. */
export interface AbuseSet {
  abuse: readonly string[];
  crisisStrong: readonly string[];
  crisisWeak: readonly string[];
}

const LANGS: Readonly<Record<Locale, WordSet>> = { ...LATIN, ...OTHER };
const ALL = Object.values(LANGS);

/** Chinese, Japanese or Korean: no spaces between words. */
export const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * A list as patterns (see the file's note): one for its spaced entries,
 * matched as whole words, and one for its Chinese, Japanese and Korean
 * entries, matched anywhere. Two scans of a message per list, not one per
 * entry: a long message stays fast.
 */
export function compileList(sources: readonly string[]): RegExp[] {
  const unique = [...new Set(sources)];
  const spaced = unique.filter((s) => !CJK.test(s)).map((s) => `(?:${s.replace(/ /g, "\\s+")})`);
  const joined = unique.filter((s) => CJK.test(s)).map((s) => `(?:${s.replace(/ /g, "\\s*")})`);
  const out: RegExp[] = [];
  if (spaced.length > 0) out.push(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${spaced.join("|")})(?![\\p{L}\\p{N}_])`, "iu"));
  if (joined.length > 0) out.push(new RegExp(joined.join("|"), "iu"));
  return out;
}

const compile = (pick: (set: WordSet) => readonly string[]): readonly RegExp[] => compileList(ALL.flatMap(pick));
const compileAbuse = (pick: (set: AbuseSet) => readonly string[]): readonly RegExp[] => compileList(Object.values(ABUSE_WORDS).flatMap(pick));

export const QUESTION_WORDS: Readonly<Record<Locale, readonly string[]>> = Object.fromEntries(
  Object.entries(LANGS).map(([lang, set]) => [lang, set.question]),
) as Record<Locale, readonly string[]>;

/**
 * Question particles that may stand anywhere in a sentence, or close it:
 * Turkish mi, mı, mu, mü; Russian ли; Vietnamese không, chưa, là gì, bao
 * nhiêu, ở đâu.
 */
export const QUESTION_PARTICLES: readonly RegExp[] = compileList([
  "(mi|mı|mu|mü|misin|mısın|musun|müsün|miyim|mıyım|midir|mıdır|mudur|müdür)(?=\\s*($|[.!?\\n]))",
  "ли",
  "(không|chưa|hả|nhỉ|chứ)(?=\\s*($|[.!?\\n]))",
  "là gì", "bao nhiêu", "ở đâu", "như thế nào", "thế nào",
]);

export const SOLICIT: readonly RegExp[] = compile((s) => s.solicit);
export const DM_WORDS: readonly RegExp[] = compile((s) => s.dm);
export const DRAINER_WORDS: readonly RegExp[] = compile((s) => s.drainer);
/** Imperative or second-person drainer bait (words-bait.ts): beside a link that isn't allowed, in a sentence rules-text.ts lets count, certain phishing. */
export const DRAINER_BAIT: readonly RegExp[] = compileList(Object.values(BAIT).flat());
/** Bait that reads the same in a statement (vi, id, zh, ja, ko): it counts only beside one of BAIT_MARKER in its sentence. */
export const MARKED_DRAINER_BAIT: readonly RegExp[] = compileList(Object.values(MARKED_BAIT).flat());
export const BAIT_MARKER: readonly RegExp[] = compileList(Object.values(BAIT_MARKERS).flat());
/** An imperative drainer verb or a call to act opening a sentence ("Validate it now", "Join …"), tested on the sentence alone. */
export const OPENING_ACT: readonly RegExp[] = [
  new RegExp(`^[\\s\\p{P}\\p{S}]*(?:${[...OPENING_BAIT, ...OPENING_PROMO].map((p) => `(?:${p.replace(/ /g, "\\s+")})`).join("|")})(?![\\p{L}\\p{N}_])`, "iu"),
];
export const HELP_WORDS: readonly RegExp[] = compile((s) => s.help);
export const REPORT_WORDS: readonly RegExp[] = compile((s) => s.report);
export const SECURITY_WORDS: readonly RegExp[] = compile((s) => s.security);
export const KEY_WORDS: readonly RegExp[] = compile((s) => s.key);
export const ROLE_WORDS: readonly string[] = [...new Set(ALL.flatMap((s) => s.role))];

/** "Support", "admin" or "help desk" inside a username, tested on its folded form (names.ts fold): usernames run words together. */
export const SUPPORT_WORDS: readonly RegExp[] = [new RegExp(SUPPORT_SOURCES.map((s) => `(?:${s})`).join("|"), "iu")];
/** Drainer bait inside a link's host or a username, tested on its folded form with the spaces removed. */
export const DRAINER_NAMES: readonly RegExp[] = [new RegExp(DRAINER_NAME_SOURCES.map((s) => `(?:${s})`).join("|"), "iu")];

const solicitList = (pick: (set: SolicitWords) => readonly string[]): readonly RegExp[] => compileList(Object.values(SOLICIT_WORDS).flatMap(pick));
/** Around a "DM me" (words-solicit.ts): support words, a member's own request, and someone else's words being reported. */
export const SOLICIT_SUPPORT: readonly RegExp[] = solicitList((s) => s.support);
export const SOLICIT_REQUEST: readonly RegExp[] = solicitList((s) => s.request);
export const SOLICIT_ATTRIBUTION: readonly RegExp[] = solicitList((s) => s.attribution);

/** Small words that may stand between a negation and what it negates ("don't ever DM me", "no need to DM me"). */
const FILLERS = ["ever", "even", "please", "pls", "plz", "just", "need", "to", "bother", "try", "really", "por favor", "bitte", "mal", "пожалуйста", "lütfen", "vui lòng", "usah", "perlu", "cần"];
const NEGATIONS = [...new Set(Object.values(SOLICIT_WORDS).flatMap((s) => s.negation))];
const either = (sources: readonly string[]) => sources.map((s) => `(?:${s.replace(/ /g, "\\s+")})`).join("|");
/** A negation at the very end of a text (the words before a solicitation in its clause), with at most two small words after it. */
export const NEGATED_BEFORE: readonly RegExp[] = [
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${either(NEGATIONS.filter((s) => !CJK.test(s)))})(?:\\s+(?:${either(FILLERS)})){0,2}\\s*$`, "iu"),
  new RegExp(`(?:${either(NEGATIONS.filter((s) => CJK.test(s)))})\\s*$`, "iu"),
];
/** German puts its negation after the verb ("schreib mir nicht", "schreibt mir keine PN"): one at the start of what follows. */
export const NEGATED_AFTER: readonly RegExp[] = [/^\s*(?:[\p{L}\p{N}'-]+\s+)?(?:nicht|keine?[nmrs]?|nie|niemals)(?![\p{L}\p{N}_])/iu];

const context = (pick: (set: ContextWords) => readonly string[]): readonly RegExp[] => compileList(Object.values(CONTEXT_WORDS).flatMap(pick));
/** The member speaking of themselves or their own trouble (words-context.ts): bait in such a sentence is never certain. */
export const FIRST_PERSON: readonly RegExp[] = context((c) => c.firstPerson);
/** Someone else's words being reported: bait or a solicitation after one isn't the author's own. */
export const ATTRIBUTION: readonly RegExp[] = compileList([...Object.values(CONTEXT_WORDS).flatMap((c) => c.attribution), ...Object.values(SOLICIT_WORDS).flatMap((s) => s.attribution)]);
export const CLAIM_WORDS: readonly RegExp[] = context((c) => c.claim);
const legit = (pick: (set: LegitWords) => readonly string[]): readonly RegExp[] => compileList(Object.values(LEGIT_WORDS).flatMap(pick));
/** What a member asks about a link (words-legit.ts); in a question about the link, a report. */
export const LEGIT: readonly RegExp[] = legit((l) => l.legit);
/** What a scammer says of a link; in a statement beside it, it voids a report. */
export const ENDORSE: readonly RegExp[] = legit((l) => l.endorse);
/** A report word denied ("no scam", "не фейк"): an endorsement. Global, so each can be blanked before report words are read. */
export const NEGATED_REPORT: readonly RegExp[] = legit((l) => l.negatedReport).map((r) => new RegExp(r.source, `${r.flags}g`));
export const DEMONSTRATIVE: readonly RegExp[] = compileList(DEMONSTRATIVES);
/** Around a "DM me" (words-solicit.ts): the team addressed, the member's own trouble as its object or in a later clause, and drainer nouns. */
export const SOLICIT_TEAM_SOURCES: readonly string[] = [...new Set(Object.values(SOLICIT_WORDS).flatMap((s) => s.team))];
export const SOLICIT_OBJECT: readonly RegExp[] = solicitList((s) => s.object);
export const SOLICIT_TROUBLE: readonly RegExp[] = solicitList((s) => s.trouble);
export const SOLICIT_BAIT: readonly RegExp[] = solicitList((s) => s.bait);

export const ABUSE: readonly RegExp[] = compileAbuse((s) => s.abuse);
export const CRISIS_STRONG: readonly RegExp[] = compileAbuse((s) => s.crisisStrong);
export const CRISIS_WEAK: readonly RegExp[] = compileAbuse((s) => s.crisisWeak);

/** Whether any pattern matches any of the texts. */
export const matchesAny = (patterns: readonly RegExp[], ...texts: readonly string[]): boolean => patterns.some((p) => texts.some((t) => p.test(t)));
