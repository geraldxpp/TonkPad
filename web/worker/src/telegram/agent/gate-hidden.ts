import type { AllowList } from "../community/types";
import { findLinks } from "../mod/links";

/**
 * Links with a hidden dot in an answer (prompts/15-community-agent.md,
 * Guardrails): what the moderation rules delete in a member's message
 * ("claim-site[.]xyz", "claim-site dot xyz", "name(.)tld", "name{.}app/x")
 * can't come back in the bot's words, readable as a domain. mod/links.ts
 * findLinks reads them, so the gate and the rules agree on what a link is;
 * each is removed here, in whatever spelling it was written. Only the names
 * the bot may write keep their plain form: tonkfun.fun, Pump.fun, Bonk.fun
 * and the bridge LI.FI (shown as LI·FI).
 */

/** Every link counts: none is allowed in an answer's text. */
const NOTHING_ALLOWED: AllowList = { domains: [], telegram: [], x: [] };
/** Names the bot may write as they are. */
export const KEPT_NAMES: ReadonlySet<string> = new Set(["tonkfun.fun", "pump.fun", "bonk.fun", "li.fi"]);
/** A dot between a host's labels, in each spelling links.ts reads, and a plain one. */
const DOT = "(?:\\s*(?:\\[\\.\\]|\\(\\.\\)|\\{\\.\\}|\\[\\s*dot\\s*\\]|\\(\\s*dot\\s*\\)|<dot>)\\s*|\\s+dot\\s+|[.\u2024])";
/** What ends a sentence after a link's path: kept. */
const TRAILING = /[.,;:!?)\]}'"»”’]+$/u;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** A host in the text in any of its dot spellings, with a "www." before it and its path after it. */
function hostIn(host: string): RegExp {
  const labels = host.split(".").map(escapeRegExp).join(DOT);
  return new RegExp(`(?<![\\p{L}\\p{N}-])(?:www\\d{0,3}${DOT})?${labels}(?![\\p{L}\\p{N}-])(?:[/?#][^\\s<>"'\`]*)?`, "giu");
}

export interface Unhidden {
  text: string;
  /** A link findLinks read could not be found in the text to remove: the answer must not go out. */
  left: boolean;
}

/** `text` without the links findLinks reads in it, but the kept names written plainly; spaces where they stood. */
export function stripHidden(text: string): Unhidden {
  let out = text;
  let left = false;
  for (const link of findLinks(text, [], NOTHING_ALLOWED)) {
    if (!link.domain) {
      left = true;
      continue;
    }
    let seen = false;
    out = out.replace(hostIn(link.domain), (match: string) => {
      seen = true;
      if (KEPT_NAMES.has(match.toLowerCase())) return match;
      return ` ${TRAILING.exec(match)?.[0] ?? ""}`;
    });
    if (!seen) left = true;
  }
  return { text: out, left };
}
