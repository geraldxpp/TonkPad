import { nearTarget, type Sentence } from "./rules-text";
import { ATTRIBUTION, BAIT_MARKER, CLAIM_WORDS, DRAINER_BAIT, FIRST_PERSON, MARKED_DRAINER_BAIT, matchesAny, NEGATED_BEFORE, OPENING_ACT } from "./words";

/**
 * Drainer bait as the author's own instruction (prompts/15-community-agent.md,
 * Drainer phishing): imperative or second-person bait (words-bait.ts), never
 * in a question or a first-person sentence ("how do I connect a wallet on
 * raydium.io?", "I can't claim my rewards"), never negated ("don't connect
 * your wallet to …") nor someone else's words ("it says claim your airdrop,
 * it's fake").
 */

/** At most this many matches of one list are weighed per sentence. */
const MATCHES_MAX = 8;
const CLAUSE_ENDS = /[,，、:：—–]/u;
const globalOf = (patterns: readonly RegExp[]) => patterns.map((p) => new RegExp(p.source, `${p.flags}g`));
const BAIT = globalOf(DRAINER_BAIT);
const MARKED = globalOf(MARKED_DRAINER_BAIT);
const CLAIMS = globalOf(CLAIM_WORDS);

/** Whether a match at `at` in `text` is negated (a negation just before it in its clause) or someone else's words (a reporting verb before it in its sentence). */
function notOwn(text: string, at: number): boolean {
  const before = text.slice(0, at);
  let clause = before.length;
  while (clause > 0 && !CLAUSE_ENDS.test(before[clause - 1])) clause--;
  return matchesAny(NEGATED_BEFORE, before.slice(clause)) || matchesAny(ATTRIBUTION, before);
}

/** A match of any of `patterns` in the text that is the author's own. */
function ownMatch(patterns: readonly RegExp[], text: string): boolean {
  for (const pattern of patterns) {
    let n = 0;
    for (const m of text.matchAll(pattern)) {
      if (++n > MATCHES_MAX) break;
      if (!notOwn(text, m.index ?? 0)) return true;
    }
  }
  return false;
}

/** A sentence a member speaks in about themselves, or asks in: bait there is never the author's instruction. */
const askingOrOwn = (s: Sentence) => s.question || matchesAny(FIRST_PERSON, s.plain);

/** Imperative or second-person bait in the sentence, as the author's own (the folded form catches look-alike letters). */
export function baitIn(s: Sentence): boolean {
  if (askingOrOwn(s)) return false;
  if (ownMatch(BAIT, s.plain) || ownMatch(BAIT, s.folded)) return true;
  return matchesAny(BAIT_MARKER, s.plain) && ownMatch(MARKED, s.plain);
}

/** Bait a risky link stands beside: in its sentence or the next one, never one about an allowed link only. */
export const baitBesideLink = (sentences: readonly Sentence[]): boolean => sentences.some((s, i) => !s.allowed && nearTarget(sentences, i) && baitIn(s));

/**
 * What in a sentence that reports nothing voids a report in the message
 * (rules-report.ts): bait, a drainer verb or a call to act opening it
 * ("Validate it now at …", "Join t.me/+…"), or the word claim as the
 * author's own ("Yes! Claim now").
 */
export function actsOnLink(s: Sentence): boolean {
  if (baitIn(s)) return true;
  if (s.question) return false;
  if (matchesAny(OPENING_ACT, s.plain)) return true;
  return !matchesAny(FIRST_PERSON, s.plain) && ownMatch(CLAIMS, s.plain);
}
