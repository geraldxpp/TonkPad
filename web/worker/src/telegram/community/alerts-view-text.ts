import { clip, visibleText } from "../../text";
import { escapeHtml as esc, safeText } from "../text";

/**
 * Cleaning for the alert lines that carry sentences someone else wrote: the
 * AI's guess and an answer the bot would have given (the model's text).
 * Each part between colons that end a phrase is cleaned by safeText, so
 * nothing in it can become a link, @mention or command; those colons come
 * back, and so do the bot's own commands.
 */

/** A colon that ends a phrase: followed by a space, or last. Any other could start a link (https:, tg:resolve), so it goes. */
const PHRASE_END = /:(?= |$)/;
/** The bot's own commands ("then send /ai on."): kept after a space or at the start, since a command can't form a link. */
const COMMAND = /(?<=^|\s)(\/(?:ai|mod|status|strict|raid|trust|untrust|trusted|forget|pause|resume|proactive|report|rules|ask|help|check|id))(?=[\s.,;!?)]|$)/;

/**
 * Text that carries sentences ("Member: a message was removed."), cut to
 * `max` characters: each part between colons that end a phrase is cleaned,
 * and those colons come back after a part with something left, each
 * followed by a space or last, with the space before it that French puts
 * there ("heures : ").
 */
export function phrases(raw: string, max: number): string {
  // Spaces of every kind are plain ones after visibleText, so "followed by a space" is read as the admins will see it.
  const visible = visibleText(raw);
  const text = [...visible].length <= max ? visible : `${clip(visible, max - 1).trimEnd()}…`;
  const parts = text.split(PHRASE_END);
  return parts
    .map((part, i) => {
      const clean = keepCommands(part, max);
      return clean === "" || i === parts.length - 1 ? clean : `${clean}${part.endsWith(" ") ? " " : ""}:`;
    })
    .filter((part) => part !== "")
    .join(" ");
}

/** safeText, except that the bot's own commands stay as written. */
function keepCommands(part: string, max: number): string {
  let out = "";
  part.split(COMMAND).forEach((piece, i) => {
    const command = i % 2 === 1;
    const text = command ? esc(piece) : safeText(piece, max);
    if (text === "") return;
    out += (out !== "" && (command || /^\s/.test(piece)) ? " " : "") + text;
  });
  return out;
}

/**
 * The bot's own words (what it did): on one line and escaped, nothing else,
 * so amounts, full stops and commands stay as written; cut to `max`
 * characters only to stay inside Telegram's limit.
 */
export function ownWords(raw: string, max: number): string {
  const text = visibleText(raw);
  return esc([...text].length <= max ? text : `${clip(text, max - 1).trimEnd()}…`);
}
