import { isLocale, type Locale } from "@/shared/i18n/config";
import { clip } from "../../text";
import { findClaims } from "./claims";
import { addressRuns, replaceRuns } from "./gate-addresses";
import { findHandle } from "./gate-handles";
import { stripHidden } from "./gate-hidden";
import { namesLevel } from "./gate-levels";
import { indexFacts, unsupportedFigures } from "./gate-numbers";
import { spelledFigures } from "./gate-spelled";
import { clipAtSentence, middleDots, plainLines, stripLinks, tidy } from "./gate-text";
import { type AnswerOutput, LINK_KEYS, type LinkKey } from "./types";

/**
 * The output gate (prompts/15-community-agent.md, Guardrails): code checks
 * every answer before anyone sees it. Facts come only from the knowledge
 * pack and this turn's tool results, never from the question; links come
 * only as buttons render.ts builds from link keys. In order: the text made
 * plain (NFKC, ASCII digits, nothing invisible); links, e-mails, mentions,
 * hashtags, cashtags and other bots' commands removed, and links written
 * with a hidden dot as the moderation rules read them; addresses checked,
 * glued to other letters or not; numbers (in digits or in words), banned
 * claims, score levels and usernames checked; dots inside words made middle
 * dots; the text cut at a sentence end. A failed check blocks the answer:
 * render.ts then shows "I'm not sure about that one" instead.
 */

export interface GateInput {
  output: AnswerOutput;
  /** The knowledge pack, the site's lines and this turn's tool results: what numbers may come from. */
  facts: string;
  /** The pack's addresses and this turn's tool results' (MAINNET_RECORD and tokens read): the only ones an answer may show. */
  allowedAddresses: ReadonlySet<string>;
  chat: "group" | "private";
  /** What an address that isn't allowed becomes: "(an address I can't verify)" in the answer's language. */
  placeholder: string;
  /** Safe, Caution and Risky in every language, from the module-14 dictionaries. */
  levelWords: readonly string[];
  /** The bot's, the official channel's and groups' usernames: the only usernames an answer may write. */
  official?: readonly string[];
}

export interface Gated {
  /** Plain text, not yet escaped (render.ts escapes it). When blocked, what was checked: never send it. */
  text: string;
  lang: Locale;
  /** Known keys only, at most 3; no referral link in a group. */
  links: LinkKey[];
  blocked: "claim" | "numbers" | "level" | "handle" | "link" | "empty" | null;
}

/** Characters an answer may keep: asked for under 600 (group) or 900 (private). */
export const MAX_ANSWER_CHARS = { group: 700, private: 1_000 } as const;
/** The most of a reply the gate reads (the answer loop already clips it to 1,200): bounds the work on a runaway reply. */
const MAX_READ_CHARS = 4_000;
const MAX_LINKS = 3;

const isLinkKey = (key: string): key is LinkKey => (LINK_KEYS as readonly string[]).includes(key);

/** Known link keys, each once, at most 3; the referral link only in a private chat. */
function gateLinks(keys: readonly string[], chat: GateInput["chat"]): LinkKey[] {
  const out: LinkKey[] = [];
  for (const key of keys) {
    if (out.length === MAX_LINKS) break;
    if (isLinkKey(key) && !out.includes(key) && !(key === "referral" && chat === "group")) out.push(key);
  }
  return out;
}

/** The first check the answer fails, reading `checked` (its text without addresses). */
function firstFailure(checked: string, lang: Locale, input: GateInput): Gated["blocked"] {
  const spelled = spelledFigures(checked, lang);
  if (spelled.uncertain || unsupportedFigures(spelled.text, indexFacts(input.facts)).length > 0) return "numbers";
  if (findClaims(checked, [], lang).length > 0) return "claim";
  if (namesLevel(checked, input.levelWords)) return "level";
  if (findHandle(checked, input.official ?? [], input.facts)) return "handle";
  return null;
}

export function gateAnswer(input: GateInput): Gated {
  const { output, chat } = input;
  const lang: Locale = isLocale(output.language) ? output.language : "en";
  const links = gateLinks(Array.isArray(output.links) ? output.links : [], chat);
  const unhidden = stripHidden(stripLinks(plainLines(clip(typeof output.reply === "string" ? output.reply : "", MAX_READ_CHARS))));
  const stripped = tidy(unhidden.text);
  const runs = addressRuns(stripped, input.allowedAddresses);
  // The checks read the text without its addresses: an address's digits aren't figures.
  const checked = replaceRuns(stripped, runs, " ", () => " ");
  let blocked: Gated["blocked"] = unhidden.left ? "link" : firstFailure(checked, lang, input);
  const text = clipAtSentence(middleDots(replaceRuns(stripped, runs, input.placeholder)), MAX_ANSWER_CHARS[chat]);
  if (blocked === null && !/[\p{L}\p{N}]/u.test(text)) blocked = "empty";
  return { text, lang, links, blocked };
}
