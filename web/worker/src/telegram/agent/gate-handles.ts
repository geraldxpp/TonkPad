import { claimsBrand } from "../channel";
import type { OfficialAccounts } from "../community/types";
import { compact } from "../mod/names-fold";
import { matchesAny, SUPPORT_WORDS } from "../mod/words";
import { gluedRole, sentTo } from "./gate-handles-glued";

/**
 * Usernames without their @ in an answer (prompts/15-community-agent.md,
 * Guardrails): the moderation rules delete a fake support handle in a
 * member's message, so the bot never sends anyone to one either. A word
 * shaped like a Telegram username (5 to 32 letters, digits or underscores)
 * blocks the answer when it holds an underscore, when it holds a support,
 * admin, help or desk word and looks made up (a digit, a capital inside it,
 * the brand), or when it looks made up beside "message", "contact", "DM" or
 * "Telegram", a lowercase role word glued to another word among them
 * ("DM supportdesk on Telegram": gate-handles-glued.ts). Ordinary words
 * pass ("admins", "helpline", "Gruppenadmins"),
 * as do the official accounts and any word the facts themselves hold
 * ("MetaMask"): the pack and the tools' figures, never a member's or a
 * creator's text.
 */

/** A word shaped like a username, standing alone: not inside a link, a path, a hashtag or a command. */
const CANDIDATE = /(?<![\p{L}\p{N}_@./:#$-])[A-Za-z0-9_]{5,32}(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/gu;
/** Role words in a username besides mod/words.ts SUPPORT_WORDS ("tonkfunhelp" has no help desk in it). */
const ROLE = /support|admin|help|desk|team|official|staff|service|bot/i;
/** Where people are sent to a username. */
const ANCHOR = /(?<![\p{L}\p{N}_])(?:messages?|messaging|msg|contacts?|contacting|dms?|pms?|telegram|tg|inbox|whatsapp|discord)(?![\p{L}\p{N}_])/giu;
const IS_ANCHOR = /^(?:messages?|messaging|msg|contacts?|contacting|dms?|pms?|telegram|tg|inbox|whatsapp|discord)$/i;
/** The bot's display name, TonkFun, which is the brand itself. */
const OWN_NAMES: readonly string[] = ["tonkfun"];
const SPACE_ONLY = /^\s+$/;

/** The usernames an answer may write (GateInput.official): the bot's, the official channel's and groups', and the X handles. */
export const officialNames = (o: OfficialAccounts): string[] => [...o.bot, ...(o.channel ? [o.channel] : []), ...o.groups, ...o.x];

/** Signs of a made-up name: an underscore, digits with letters, a capital after a small letter, or the brand. */
const madeUp = (word: string): boolean =>
  word.includes("_") || (/\d/.test(word) && /[A-Za-z]/.test(word)) || /\p{Ll}\p{Lu}/u.test(word) || claimsBrand(word, "");

const hasRole = (word: string): boolean => ROLE.test(word) || matchesAny(SUPPORT_WORDS, compact(word));

/**
 * Whether `text` holds a username-shaped word that could send someone to
 * an impostor. `official` lists the bot's, the channel's and the groups'
 * usernames; `facts` is what the answer's figures come from.
 */
export function findHandle(text: string, official: readonly string[], facts = ""): boolean {
  const own = new Set([...official.map((name) => name.replace(/^@/, "").toLowerCase()), ...OWN_NAMES]);
  const known = new Set(facts.match(/[A-Za-z0-9_]{5,32}/g) ?? []);
  const anchors = [...text.matchAll(ANCHOR)].map((m): [number, number] => [m.index, m.index + m[0].length]);
  for (const m of text.matchAll(CANDIDATE)) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    if (own.has(word.toLowerCase()) || known.has(word) || IS_ANCHOR.test(word)) continue;
    if (!madeUp(word)) {
      if (gluedRole(word) && sentTo(text, start, end)) return true;
      continue;
    }
    if (word.includes("_") || hasRole(word)) return true;
    if (anchors.some(([a, b]) => SPACE_ONLY.test(text.slice(b, start)) || SPACE_ONLY.test(text.slice(end, a)))) return true;
  }
  return false;
}
