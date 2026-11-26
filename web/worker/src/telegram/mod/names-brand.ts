import { editDistance, NOT_BRAND } from "./names-fold";

/**
 * The brand in a display name once its words are run together
 * (names.ts nameRisk): "T.onkfun", "To nkfun", "T-o-n-k-f-u-n", or one
 * look-alike edit away ("Tomkfun", "Tonfkun", "Toonkfun"). Never another
 * launchpad's name ("Bonk Fun", "Pump Fun"), TON's ("TON Pad", "TONPad",
 * "TON Fun"), or an ordinary word one letter off ("Tank Fun", "Monk Fun",
 * "Tone Pad", "Stonks Fun").
 */

const STEMS = ["tonkfun", "tonkpad"];
/** The part of the brand an edit after which still reads as the brand ("Tonkfum", "Tonkpaad"). */
const HEAD = "tonk";
/** Other launchpads' names: a window that starts with one is that launchpad, never the brand. */
const OTHER_PADS = /^(?:bonk|pump|pons|moon|heaven|bags)/u;
/** Letters that pass for each other in a name: one swapped for the other is a look-alike ("Tomkfun"). */
const SWAPS = new Set(["mn", "nm", "uv", "vu", "il", "li"]);
/** Longest name the check reads: Telegram's names and tags are far shorter. */
const SQUASHED_MAX = 256;

/**
 * Whether `window` (one edit from `stem`) reads as the brand: two letters
 * swapped, a letter doubled, a look-alike letter, or an edit after the
 * brand's head ("tonk") with the head intact. A letter dropped or changed
 * within the head ("TONPad", "Tank", "Tone") is another word.
 */
function lookalikeEdit(window: string, stem: string): boolean {
  let i = 0;
  while (i < window.length && i < stem.length && window[i] === stem[i]) i++;
  const afterHead = i >= HEAD.length;
  if (window.length === stem.length) {
    const swapped = window[i] === stem[i + 1] && window[i + 1] === stem[i] && window.slice(i + 2) === stem.slice(i + 2);
    return swapped || SWAPS.has(`${window[i]}${stem[i]}`) || afterHead;
  }
  if (window.length === stem.length + 1) {
    const extra = window[i];
    return extra === window[i - 1] || extra === window[i + 1] || afterHead;
  }
  return afterHead;
}

/**
 * The brand in a folded name with its spaces and punctuation taken out, or
 * one look-alike edit away from it there (lookalikeEdit), starting at one of
 * its words; ordinary look-alike words (Tonka, Thinkpad) are set aside
 * first. One edit, not two: two would take in real names such as ThinkFun
 * or T. Onken.
 */
export function brandSquashed(folded: string): boolean {
  const words = folded.split(" ").filter((w) => w !== "" && !NOT_BRAND.has(w));
  const squashed = words.join("").slice(0, SQUASHED_MAX);
  if (STEMS.some((stem) => squashed.includes(stem))) return true;
  const starts: number[] = [];
  let at = 0;
  for (const word of words) {
    if (at >= squashed.length) break;
    starts.push(at);
    at += word.length;
  }
  return starts.some((start) =>
    STEMS.some((stem) => {
      for (let length = stem.length - 1; length <= stem.length + 1; length++) {
        const window = squashed.slice(start, start + length);
        if (window.length !== length || OTHER_PADS.test(window)) continue;
        if (editDistance(window, stem) === 1 && lookalikeEdit(window, stem)) return true;
      }
      return false;
    }),
  );
}
