import { splitAddresses } from "./gate-addresses-split";

/**
 * Addresses in an answer (prompts/15-community-agent.md, Guardrails): an
 * EVM or Solana address must match one the pack or this turn's tools hold,
 * else it becomes "(an address I can't verify)". One glued to other letters
 * ("address0x…", "CA7GCih…", "0x…on") is found too, and the whole run of
 * letters and digits around it is replaced, so no copyable part is left; so
 * is one split by spaces or underscores (gate-addresses-split.ts).
 */

/** A run of letters and digits: what an address is glued into. */
const RUN = /[0-9A-Za-z]+/g;
/** An EVM address anywhere in a run, but never the head of a longer hex string (a transaction hash). */
const EVM = /0[xX][0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
/** Runs of base58 characters inside a run. */
const BASE58 = /[1-9A-HJ-NP-Za-km-z]+/g;
/** A Solana address is 32 to 44 base58 characters; glued to a short word ("CA", "mint", "address"), its run reaches 52. */
const SOLANA_MIN = 32;
const SOLANA_MAX = 44;
const GLUED_MAX = 52;

export interface AddressRun {
  start: number;
  end: number;
  /** Every address in it is one the answer may show. */
  allowed: boolean;
}

/**
 * Each run of letters and digits holding an address: an EVM address (any
 * case), or a run of 32 to 44 base58 characters (exactly), or of 45 to 52
 * when glued to a word (allowed when it holds an allowed address). A longer
 * run, such as a 64-character hash, holds none.
 */
export function addressRuns(text: string, allowed: ReadonlySet<string>): AddressRun[] {
  const evmAllowed = new Set([...allowed].map((a) => a.toLowerCase()));
  const solana = [...allowed].filter((a) => !/^0x/i.test(a) && a.length >= SOLANA_MIN);
  const split = splitAddresses(text);
  const out: AddressRun[] = split.map((s) => ({ start: s.start, end: s.end, allowed: s.evm ? evmAllowed.has(s.joined.toLowerCase()) : allowed.has(s.joined) }));
  for (const m of text.matchAll(RUN)) {
    const run = m[0];
    if (run.length < SOLANA_MIN || split.some((s) => m.index >= s.start && m.index < s.end)) continue;
    const evm = [...run.matchAll(EVM)].map((e) => e[0]);
    let found: boolean[];
    if (evm.length > 0) found = evm.map((a) => evmAllowed.has(a.toLowerCase()));
    else {
      found = [];
      for (const b of run.matchAll(BASE58)) {
        const part = b[0];
        if (part.length >= SOLANA_MIN && part.length <= SOLANA_MAX) found.push(allowed.has(part));
        else if (part.length > SOLANA_MAX && part.length <= GLUED_MAX) found.push(solana.some((a) => part.includes(a)));
      }
    }
    if (found.length > 0) out.push({ start: m.index, end: m.index + run.length, allowed: found.every(Boolean) });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** `text` with each run replaced: `allowed` runs by `keep(run)`, the rest by `other`. */
export function replaceRuns(text: string, runs: readonly AddressRun[], other: string, keep: (run: string) => string = (run) => run): string {
  let out = "";
  let at = 0;
  for (const r of runs) {
    out += text.slice(at, r.start) + (r.allowed ? keep(text.slice(r.start, r.end)) : other);
    at = r.end;
  }
  return out + text.slice(at);
}
