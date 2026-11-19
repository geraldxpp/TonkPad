import { clip, visibleText } from "../text";

/**
 * Text for Telegram's HTML parse mode. Anything a token says about itself is
 * untrusted (the chain sets no limits), and Telegram turns some plain text
 * into live entities on its own: @mentions, #hashtags, $cashtags, /commands,
 * URLs and e-mails. So chain text loses the characters those need, every dot
 * with something after it becomes a middle dot ("claim.evil.xyz" →
 * "claim·evil·xyz", whatever letters or symbols surround it, since a browser
 * maps "ⓜ" or "™" to plain letters in a host name), and the rest is escaped.
 */
const TRIGGERS = /[@#$/\\:]/g;
/** A dot that leads on into more text (a trailing "..." keeps its dots). */
const DOTTED = /[.\u3002\uFF0E\uFF61](?=[.\u3002\uFF0E\uFF61]*[^\s.\u3002\uFF0E\uFF61])/gu;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A token's own text as plain text (buttons, share text, inline titles): visible, no live entities, at most `max` characters. */
export function plainText(raw: string, max: number): string {
  const cleaned = visibleText(raw).replace(TRIGGERS, "").replace(DOTTED, "·").replace(/ {2,}/g, " ").trim();
  return [...cleaned].length <= max ? cleaned : `${clip(cleaned, max - 1).trimEnd()}…`;
}

/** A token's own text for an HTML message: as plainText, then escaped. */
export function safeText(raw: string, max: number): string {
  return escapeHtml(plainText(raw, max));
}

/** A trusted template (the bot's own words) with {placeholders} filled by values that are already safe HTML. */
export function fill(template: string, values: Record<string, string | number>): string {
  return escapeHtml(template).replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

const EVM = /(?<![0-9a-zA-Z])0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])/;
const BASE58 = "1-9A-HJ-NP-Za-km-z";
const SOLANA = new RegExp(`(?<![${BASE58}])[${BASE58}]{32,44}(?![${BASE58}])`);

/** The first token address in a message: an EVM address (lower-cased) or a Solana one, also inside a link. */
export function findAddress(text: string): string | null {
  const evm = text.match(EVM);
  if (evm) return evm[0].toLowerCase();
  const solana = text.match(SOLANA);
  return solana ? solana[0] : null;
}

export const isEvm = (address: string) => /^0x[0-9a-f]{40}$/.test(address);
export const isTokenAddress = (address: string) => isEvm(address) || new RegExp(`^[${BASE58}]{32,44}$`).test(address);

/** 0xfd42e33d…23cd95 → "0xfd42…cd95". */
export const shortAddr = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);
