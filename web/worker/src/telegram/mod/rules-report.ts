import { fold } from "./names-fold";
import { actsOnLink } from "./rules-bait";
import { nearTarget, type Sentence, TARGET } from "./rules-text";
import { DEMONSTRATIVE, ENDORSE, LEGIT, matchesAny, NEGATED_REPORT, REPORT_WORDS } from "./words";

/**
 * Reporting or asking about a scam (prompts/15-community-agent.md, The
 * rules): report words aimed at the message's link or handle (in its
 * sentence or the one next to it), or a legitimacy question about it
 * wherever it stands ("@TonkfunBot is tonkfun-airdrop.xyz real?", "can I
 * trust …?", "… 是官网吗？"). A report is void when the message also tells
 * the reader to act on its link (bait, "claim", "Join …") or vouches for it
 * ("legit", "official", "no scam") in a sentence, or a clause beside the
 * link, that reports nothing ("Beware of fake sites, use only <link>").
 */
export interface ReportRead {
  /** Report words or a legitimacy question anywhere: the reportWords marker, for Haiku's check and the triggers. */
  words: boolean;
  /** A report that stands: aimed at the link or handle, and not void. */
  report: boolean;
}

/** A negation anywhere in a sentence ("isn't official", "公式じゃない"): its endorsement words vouch for nothing. */
const NEGATION = /(?<![\p{L}\p{N}_])(?:not|no|never|isn'?t|aren'?t|wasn'?t|ain'?t|non|nunca|n[aã]o|pas|nicht|kein\p{L}*|değil|không|bukan|tidak|gak|не|ни)(?![\p{L}\p{N}_])|不是|不|没|沒|じゃない|ではない|아니|않/iu;

/** The sentence without its denied report words ("no scam", "не фейк"): what is left is what it reports. */
const undenied = (plain: string) => NEGATED_REPORT.reduce((text, p) => text.replace(p, " "), plain);
const reportsIn = (plain: string) => matchesAny(REPORT_WORDS, undenied(plain));
const CLAUSES = /[,，、:：—–]+/u;
/** At most this many clauses of a sentence are weighed. */
const CLAUSES_MAX = 16;

/** A sentence's clauses that hold its link (all of them when the link has no place in the text), each read as a sentence of its own. */
function linkClauses(s: Sentence): Sentence[] {
  const placed = s.plain.includes(TARGET);
  return s.plain
    .split(CLAUSES)
    .slice(0, CLAUSES_MAX)
    .filter((c) => !placed || c.includes(TARGET))
    .map((plain) => ({ ...s, plain, folded: fold(plain), allowed: false, target: true }));
}

/** A question about the link or handle: it holds it, or points at it from beside it ("is this the official site? <link>"), or the message names none. */
function legitimacyQuestion(sentences: readonly Sentence[], i: number, targets: boolean): boolean {
  const s = sentences[i];
  if (!s.question || !matchesAny(LEGIT, s.plain)) return false;
  return !targets || s.target || (nearTarget(sentences, i) && matchesAny(DEMONSTRATIVE, s.plain));
}

/** What in a sentence that reports nothing vouches for the link or tells the reader to act on it; a sentence about an allowed link only never does. */
function voids(s: Sentence): boolean {
  if (s.allowed) return false;
  if (actsOnLink(s)) return true;
  const vouches = NEGATED_REPORT.some((p) => s.plain.search(p) >= 0) || (!NEGATION.test(s.plain) && matchesAny(ENDORSE, s.plain));
  return !s.question && s.target && vouches;
}

export function readReport(sentences: readonly Sentence[], plain: string): ReportRead {
  const targets = sentences.some((s) => s.target);
  let words = matchesAny(REPORT_WORDS, plain);
  let aimed = false;
  let voided = false;
  sentences.forEach((s, i) => {
    const asks = legitimacyQuestion(sentences, i, targets);
    const reports = asks || reportsIn(s.plain);
    words ||= asks;
    if (reports && (asks || !targets || nearTarget(sentences, i))) aimed = true;
    if (!reports && (s.target || !sentences.some((t) => t.allowed)) && voids(s)) voided = true;
    // In a report sentence, a clause beside the link that reports nothing may still vouch for it.
    if (reports && !s.question && s.target && linkClauses(s).some((c) => !reportsIn(c.plain) && voids(c))) voided = true;
  });
  return { words, report: aimed && !voided };
}
