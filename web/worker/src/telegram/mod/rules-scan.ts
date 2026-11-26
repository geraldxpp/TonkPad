import { clip } from "../../text";
import type { Markers } from "../community/types";
import { findAddress } from "../text";
import type { TgMessageEntity } from "../types";
import { findContacts, findHandles, findLinks, type FoundLink, opensWithCommand, stripLinks } from "./links";
import { fold } from "./names-fold";
import type { RuleInput } from "./rules";
import { CJK, CRISIS_STRONG, CRISIS_WEAK, DM_WORDS, HELP_WORDS, matchesAny, QUESTION_PARTICLES, QUESTION_WORDS, REPORT_WORDS } from "./words";

/**
 * The markers, with what a link raid counts (flood.ts): the risky links'
 * raid keys (links-kind.ts FoundLink.raid: host and path, no query), never
 * an @handle, a token address or a bot command's links, and those of a
 * severe kind (severeKeys: a look-alike, a drainer, a hidden-dot host, an
 * invite). linkKeys keeps handles and addresses, for the edit memory. And
 * what the rules found beyond Markers: `reports`, a report that stands
 * (rules-report.ts: never a raider), and `dmRequest`, a member asking to be
 * messaged for help (rules-solicit.ts: answered with the DM-safety warning).
 * community/types.ts Markers carries raidKeys as optional; the scan always
 * sets these, rules.ts fills them in, and the readers below read them back
 * from a rules result.
 */
export type ScanMarkers = Markers & { raidKeys: string[]; severeKeys: string[]; reports: boolean; dmRequest: boolean };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
const field = (markers: Markers, name: "raidKeys" | "severeKeys" | "reports" | "dmRequest"): unknown => (name in markers ? (markers as Partial<ScanMarkers>)[name] : undefined);

/** A rules result's raid keys (ScanMarkers.raidKeys), for FloodWatch.note's keys; none when the markers carry none. */
export const raidKeysOf = (markers: Markers): string[] => strings(field(markers, "raidKeys"));
/** Those of its raid keys of a severe kind (ScanMarkers.severeKeys), for FloodWatch.note's severe. */
export const severeKeysOf = (markers: Markers): string[] => strings(field(markers, "severeKeys"));
/** Whether the rules read the message as a report that stands (ScanMarkers.reports): it counts toward raid mode but is never a raider. */
export const reportOf = (markers: Markers): boolean => field(markers, "reports") === true;
/** Whether a member asks to be messaged for help (ScanMarkers.dmRequest): kept, and answered with the DM-safety warning. */
export const dmRequestOf = (markers: Markers): boolean => field(markers, "dmRequest") === true;

/** One read of a message: what the rules and the markers both need. */
export interface Scan {
  /** NFKC, lower case, invisible characters dropped, line breaks kept: what the word lists are matched on. */
  plain: string;
  /** names-fold.ts fold: catches look-alike letters in Latin patterns. */
  folded: string;
  /** plain without official, bot and admin @usernames: "talk to @alex_admin" asks nobody to message a stranger. */
  solicit: string;
  links: FoundLink[];
  /** Links that aren't allowed or official. */
  risky: FoundLink[];
  /** Mentioned usernames that aren't official, the bot's or an admin's. */
  strangers: string[];
  contacts: { phones: number; emails: number };
  markers: ScanMarkers;
}

const INVISIBLE = /[\p{Cf}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{2800}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}]/gu;
const QUESTION_MARKS = /[?？؟¿]/u;
const SENTENCES = /[.!;。！\n]+/u;
/** Hex too long for an address (transaction hashes, keys, file hashes): blanked before addresses are read, so no piece of one passes for a Solana address. */
const HASHLIKE = /(?<![0-9a-z])(?:0x[0-9a-f]{41,}|[0-9a-f]{32,})(?![0-9a-z])/giu;
const SPACED_HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const MENTION = /@([a-z][a-z0-9_]{3,31})(?![a-z0-9_])/gu;
/** A username in the text (links.ts findHandles), blanked before a question is looked for. */
const HANDLE = /(?<![\p{L}\p{N}_@./:])@[a-z][a-z0-9_]{3,31}(?![a-z0-9_])/giu;
/** An ASCII ? between link characters ("claim?ref=1"): a query in a link the scan couldn't place (one with a hidden dot), not a question. */
const QUERY_MARK = /(?<=[A-Za-z0-9/_.%~-])\?(?=[A-Za-z0-9_%=&.~-])/gu;
/** At most this many button targets, each at most this long (media.ts buttonLinks keeps the same bounds). */
const BUTTONS_MAX = 50;
const BUTTON_CHARS = 2_048;

/** The text the word lists are matched on: NFKC (so ＤＭ is DM), lower case, invisible characters dropped, line breaks kept. */
export function plainText(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase().replace(/̇/g, "").replace(/[’‘ʼ`´]/g, "'");
}

const STARTS = Object.values(QUESTION_WORDS).flat().map((w) => ({ word: w.normalize("NFKC").toLowerCase(), anywhere: CJK.test(w) }));

const blank = (part: string) => " ".repeat(part.length);
/** Telegram's entities as the scan reads them: objects with a type; anything else is dropped. */
const cleanEntities = (raw: unknown): TgMessageEntity[] =>
  Array.isArray(raw) ? raw.filter((e: unknown): e is TgMessageEntity => typeof e === "object" && e !== null && typeof (e as { type?: unknown }).type === "string") : [];

/** The words a question is read in: links (with their queries), usernames and e-mail addresses blanked out. */
function questionText(text: string, entities: readonly TgMessageEntity[]): string {
  const chars = stripLinks(text, entities).split("");
  for (const { type, offset, length } of entities) {
    if ((type !== "mention" && type !== "email") || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0) continue;
    for (let i = offset; i < offset + length && i < chars.length; i++) chars[i] = " ";
  }
  return chars.join("").replace(HANDLE, blank).replace(QUERY_MARK, " ");
}

/**
 * A question by its mark (?, ？, ؟ or ¿), a particle, or a question word
 * opening a sentence (anywhere, for Chinese, Japanese and Korean), read
 * without links and usernames: the ? of "claim.xyz/go?ref=1" asks nothing.
 */
export function isQuestion(text: string, entities: readonly TgMessageEntity[] = []): boolean {
  const plain = plainText(questionText(typeof text === "string" ? text : "", cleanEntities(entities)));
  if (QUESTION_MARKS.test(plain) || matchesAny(QUESTION_PARTICLES, plain)) return true;
  const sentences = plain.split(SENTENCES).map((s) => s.trim().replace(/^(?:[@/]\S*\s+)+/u, "").replace(/^[^\p{L}\p{N}]+/u, ""));
  return STARTS.some(({ word, anywhere }) => (anywhere ? plain.includes(word) : sentences.some((s) => s === word || s.startsWith(`${word} `) || s.startsWith(`${word},`))));
}

/** Every token address in a text (telegram/text.ts findAddress, all of them; EVM lower case), never a piece of a longer hash. */
export function allAddresses(text: string): string[] {
  let rest = text.replace(HASHLIKE, " ");
  const out: string[] = [];
  for (let found = findAddress(rest); found !== null && out.length < 50; found = findAddress(rest)) {
    out.push(found);
    rest = found.startsWith("0x") ? rest.replace(new RegExp(found, "gi"), " ") : rest.split(found).join(" ");
  }
  return out;
}

/** Words for "3 words or more": spaced words, and Chinese or Japanese runs counted two characters to a word. */
function countWords(plain: string): number {
  let n = 0;
  for (const token of plain.split(/\s+/u)) {
    if (!/[\p{L}\p{N}]/u.test(token)) continue;
    const han = token.match(SPACED_HAN)?.length ?? 0;
    n += han > 0 ? Math.max(1, Math.ceil(han / 2)) : 1;
  }
  return n;
}

const keyOf = (address: string) => (address.startsWith("0x") ? address.toLowerCase() : address);

/** The targets of a message's link buttons, as given (untrusted): strings only, within bounds. */
function buttonTargets(raw: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(raw)) return out;
  for (const target of raw) {
    if (out.length >= BUTTONS_MAX) break;
    if (typeof target === "string" && target.trim() !== "") out.push(clip(target, BUTTON_CHARS));
  }
  return out;
}

/**
 * Reads a message once for the rules: its links (its link buttons'
 * targets, `buttons`, among them), usernames, addresses and words, and the
 * markers for Haiku's check, the triggers, the edit memory and link raids.
 */
export function scanMessage(input: Pick<RuleInput, "text" | "entities" | "allow" | "bot" | "admins" | "packAddresses"> & { buttons?: unknown }): Scan {
  const { text, allow } = input;
  const entities = cleanEntities(input.entities);
  const plain = plainText(text);
  const links = findLinks(text, entities, allow, buttonTargets(input.buttons));
  const risky = links.filter((l) => l.kind !== "allowed" && l.kind !== "official_telegram");
  const official = new Set([...allow.telegram, ...input.bot].map((n) => n.toLowerCase().replace(/^@/, "")));
  const admins = new Set(input.admins.flatMap((a) => (a.username ? [a.username.toLowerCase()] : [])));
  const others = findHandles(text, entities).filter((h) => !official.has(h));
  const strangers = others.filter((h) => !admins.has(h));
  const pack = new Set([...input.packAddresses].map(keyOf));
  const bare = allAddresses(stripLinks(text, entities)).filter((a) => !pack.has(keyOf(a)));
  const strong = matchesAny(CRISIS_STRONG, plain);
  const markers: ScanMarkers = {
    question: isQuestion(text, entities),
    domains: [...new Set(links.flatMap((l) => (l.domain ? [l.domain] : [])))],
    linkKeys: [...new Set([...risky.map((l) => l.key), ...strangers.map((h) => `@${h}`), ...bare])],
    raidKeys: opensWithCommand(text) ? [] : [...new Set(risky.map((l) => l.raid))],
    severeKeys: [],
    reports: false,
    dmRequest: false,
    unknownLinks: risky.length,
    handles: others.length,
    addresses: allAddresses(text),
    helpWords: matchesAny(HELP_WORDS, plain),
    dmWords: matchesAny(DM_WORDS, plain),
    reportWords: matchesAny(REPORT_WORDS, plain),
    crisis: strong ? "strong" : matchesAny(CRISIS_WEAK, plain) ? "weak" : null,
    words: countWords(plain),
  };
  const solicit = plain.replace(MENTION, (mention, name: string) => (official.has(name) || admins.has(name) ? " " : mention));
  return { plain, folded: fold(text), solicit, links, risky, strangers, contacts: findContacts(entities), markers };
}
