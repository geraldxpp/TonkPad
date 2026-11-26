import { matchesAny, SOLICIT_OBJECT, SOLICIT_REQUEST, SOLICIT_TEAM_SOURCES, SOLICIT_TROUBLE } from "./words";

/**
 * A "DM me" that asks for help rather than offering it
 * (prompts/15-community-agent.md, "DM me" and fake support): addressed to
 * the team ("admins, DM me", "Mods: contact me", "can an admin DM me?",
 * "please DM me admins", "管理员请私信我"), or inside a request ("my launch is
 * stuck, can someone DM me", "DM me for help with my stuck tx", "DM me, my
 * wallet got drained"). Never the author's own: a help request is kept,
 * answered with the DM-safety warning and left to Haiku's check.
 */

/** Small words around a team word that still leave it addressed ("hey admins,", "can an admin", "please DM me admins pls"). */
const FILLERS = [
  "hey", "hi", "hello", "dear", "ok", "okay", "yo", "please", "pls", "plz", "can", "could", "would", "will", "may", "an?", "the", "any", "some", "one", "someone", "anyone", "somebody", "anybody",
  "from", "of", "guys", "sir", "ser", "asap", "thanks", "thx", "ty", "now", "por favor", "alg[uú]n", "algum", "um", "una?", "svp", "bitte", "kann", "jemand", "пожалуйста", "кто-нибудь", "lütfen",
  "vui lòng", "ơi", "tolong", "dong", "请", "請", "您好", "你好", "すみません", "님",
];
const either = (sources: readonly string[]) => sources.map((s) => `(?:${s.replace(/ /g, "\\s+")})`).join("|");
const GAP = "[\\s\\p{P}\\p{S}]*";
const TEAM = either(SOLICIT_TEAM_SOURCES);
/** A text that is only the team addressed, fillers aside: the words before a solicitation in its sentence ("Mods:"), or the rest of its clause ("… admins"). */
const TEAM_ONLY = new RegExp(`^${GAP}(?:(?:${either(FILLERS)})${GAP})*(?:${TEAM})(?:${GAP}(?:${either(FILLERS)}))*${GAP}$`, "iu");
/** Longer than this, a text is more than someone addressed (and the pattern is never tried on a long run). */
const ADDRESS_MAX = 60;
const addressed = (text: string) => text.length <= ADDRESS_MAX && TEAM_ONLY.test(text);

/** The texts around one solicitation: its sentence before it, the rest of its clause, and the rest of its sentence after that clause. */
export interface Around {
  before: string;
  clauseAfter: string;
  sentenceAfter: string;
}

/** Whether the solicitation asks for help (see the file's note). */
export function isRequest({ before, clauseAfter, sentenceAfter }: Around): boolean {
  if (addressed(before) || addressed(clauseAfter) || addressed(`${clauseAfter}${sentenceAfter}`)) return true;
  if (matchesAny(SOLICIT_REQUEST, before) || matchesAny(SOLICIT_OBJECT, clauseAfter)) return true;
  // A later clause of the member's own trouble ("DM me, my wallet got drained"), never "DM me for support, my team will fix it".
  return matchesAny(SOLICIT_REQUEST, sentenceAfter) && matchesAny(SOLICIT_TROUBLE, sentenceAfter);
}
