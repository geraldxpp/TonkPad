/**
 * "One word off" for the seed-phrase scan (secrets-seed.ts), bounded so a
 * crafted message can't stall the worker: each wordlist is indexed once by
 * word length and 4-letter prefix, the edit distance is banded and stops as
 * soon as it passes two, and a message gets at most MAX_NEAR fresh look-ups
 * (repeats are remembered). Past the cap a window counts as no phrase.
 */

/** Fresh look-ups per message; a real phrase with a typo needs one or two. */
const MAX_NEAR = 200;

/** One wordlist as the look-ups read it: its words by length (in code points, as arrays) and its 4-letter prefixes. */
interface NearIndex {
  byLength: ReadonlyMap<number, ReadonlyArray<readonly string[]>>;
  prefixes: ReadonlySet<string>;
}

const indexes = new WeakMap<readonly string[], NearIndex>();

function indexOf(list: readonly string[]): NearIndex {
  const known = indexes.get(list);
  if (known) return known;
  const byLength = new Map<number, string[][]>();
  const prefixes = new Set<string>();
  for (const word of list) {
    const chars = [...word];
    const bucket = byLength.get(chars.length);
    if (bucket) bucket.push(chars);
    else byLength.set(chars.length, [chars]);
    if (word.length >= 4) prefixes.add(word.slice(0, 4));
  }
  const index = { byLength, prefixes };
  indexes.set(list, index);
  return index;
}

const FAR = 3;
/** The rows a distance is worked out in, reused (words are short; a longer one gets its own). */
const ROWS = 48;
const shared = [new Uint8Array(ROWS), new Uint8Array(ROWS), new Uint8Array(ROWS)];

/**
 * Whether two words are at most two edits apart (insert, delete, replace,
 * swap two neighbours, as names-fold.ts editDistance counts them). Only the
 * band of cells within two of the diagonal can stay under three, so only it
 * is computed, and a row that is all past two ends it.
 */
function withinTwo(a: readonly string[], b: readonly string[]): boolean {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > 2) return false;
  let [before, prev, row] = m < ROWS ? shared : [new Uint8Array(m + 1), new Uint8Array(m + 1), new Uint8Array(m + 1)];
  for (let j = 0; j <= m; j++) prev[j] = Math.min(j, FAR);
  for (let i = 1; i <= n; i++) {
    row.fill(FAR, 0, m + 1);
    row[0] = Math.min(i, FAR);
    let best = row[0];
    for (let j = Math.max(1, i - 2); j <= Math.min(m, i + 2); j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1);
      row[j] = Math.min(d, FAR);
      if (row[j] < best) best = row[j];
    }
    if (best > 2) return false;
    [before, prev, row] = [prev, row, before];
  }
  return prev[m] <= 2;
}

/** A typo of a word in the list: within two edits of one, or the first four letters of one (BIP-39 words are unique by those). */
function nearWord(word: string, list: readonly string[]): boolean {
  const { byLength, prefixes } = indexOf(list);
  const chars = [...word];
  if (chars.length >= 4 && prefixes.has(word.slice(0, 4))) return true;
  for (let length = chars.length - 2; length <= chars.length + 2; length++) {
    for (const candidate of byLength.get(length) ?? []) if (withinTwo(chars, candidate)) return true;
  }
  return false;
}

/** One message's look-ups: remembered per list and word, and at most MAX_NEAR fresh ones; past that, every answer is no. */
export function nearLookups(): (word: string, list: number, words: readonly string[]) => boolean {
  const seen = new Map<string, boolean>();
  let fresh = 0;
  return (word, list, words) => {
    const key = `${list}\u0000${word}`;
    const known = seen.get(key);
    if (known !== undefined) return known;
    if (fresh >= MAX_NEAR) return false;
    fresh++;
    const near = nearWord(word, words);
    seen.set(key, near);
    return near;
  };
}
