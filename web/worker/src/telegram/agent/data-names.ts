import { clip, visibleText } from "../../text";
import { claimsBrand } from "../channel";
import type { AllowList } from "../community/types";
import { findHandles, findLinks } from "../mod/links";
import { compact } from "../mod/names-fold";
import { DRAINER_NAMES, DRAINER_WORDS, matchesAny, SUPPORT_WORDS } from "../mod/words";
import { plainText } from "../text";

/**
 * When get_token hides a token's name and ticker (prompts/15-community-agent.md,
 * The tools): a creator can call a token anything, and the model must never
 * repeat a name that poses as tonkfun.fun or carries a scammer's bait.
 */

/** What the model reads, and may say, in place of a hidden name. */
export const HIDDEN_NAME = "[name hidden]";

/** No link is allowed in a token's name: every one counts. */
const NOTHING_ALLOWED: AllowList = { domains: [], telegram: [], x: [] };
/** Look-alike dots a creator might use to pass a link off as words ("claim·evil·xyz"): each read as a dot. */
const DOTS = /[\u00B7\u2022\u2219\u2024\u2027\u2E31\u3002\u30FB\uFF0E\uFF61]/gu;
/** Names are cut at 48 characters when stored (model.ts); this bounds the work on anything that isn't. */
const MAX_TEXT = 200;

/**
 * A link or a handle, or airdrop, claim, reward or support words, in a
 * name or ticker as its creator wrote it: the moderation rules' own lists
 * in the site's 12 languages (mod/words.ts), on the text and on its folded
 * form with the spaces removed ("ClaimReward", "TonkSupport").
 */
export function offersOrLinks(raw: string): boolean {
  const text = clip(visibleText(raw), MAX_TEXT).normalize("NFKC");
  if (text === "") return false;
  const dotted = text.replace(DOTS, ".");
  if (findLinks(dotted, [], NOTHING_ALLOWED).length > 0 || findHandles(dotted, []).length > 0) return true;
  const squashed = compact(text);
  return matchesAny(DRAINER_WORDS, text) || matchesAny(DRAINER_NAMES, squashed) || matchesAny(SUPPORT_WORDS, squashed);
}

/**
 * Whether a token's name and ticker are hidden: they use the brand by the
 * channel's own rule (claimsBrand, on the text as plainText shows it) and
 * the creator isn't one the owner named (TELEGRAM_BRAND_CREATORS, lower
 * case), or either holds a link, a handle or bait words. The owner's list
 * lifts only the brand rule.
 */
export function nameHidden(name: string, ticker: string, creator: string, brandCreators: ReadonlySet<string>): boolean {
  const brand = claimsBrand(plainText(name, 40), plainText(ticker, 16)) && !brandCreators.has(creator.toLowerCase());
  return brand || offersOrLinks(name) || offersOrLinks(ticker);
}
