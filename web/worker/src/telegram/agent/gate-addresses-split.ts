/**
 * Addresses split by spaces, underscores or hyphens in an answer
 * (answers#11), for gate-addresses.ts: "0x22222222222222222222
 * 22222222222222222222" and "0x2222_2222_…" can be copied and joined, so the
 * whole span is read as one address and replaced as one. An EVM address is
 * "0x" and 40 hex digits in all; a Solana address 32 to 44 base58
 * characters in groups of 4 or more, each with a digit, so words never join
 * into one.
 */

/** "0x" and 40 hex digits with spaces, underscores or hyphens among them, not part of a longer run. */
const EVM_SPLIT = /(?<![0-9A-Za-z])0[xX](?:[ _-]?[0-9a-fA-F]){40}(?![ _-]?[0-9a-fA-F])/g;
const B58 = "[1-9A-HJ-NP-Za-km-z]";
/** Base58 groups of 4 or more joined by single spaces or underscores. */
const SOLANA_SPLIT = new RegExp(`(?<![0-9A-Za-z])${B58}{4,}(?:[ _]${B58}{4,})+(?![0-9A-Za-z])`, "g");
const SEPARATOR = /[ _-]/g;
const SOLANA_MIN = 32;
const SOLANA_MAX = 44;

export interface SplitAddress {
  start: number;
  end: number;
  /** The address with its separators removed. */
  joined: string;
  evm: boolean;
}

/** Every address in `text` written in parts: EVM ones with a separator inside, Solana ones of 2 or more groups. */
export function splitAddresses(text: string): SplitAddress[] {
  const out: SplitAddress[] = [];
  for (const m of text.matchAll(EVM_SPLIT)) {
    if (!/[ _-]/.test(m[0])) continue;
    out.push({ start: m.index, end: m.index + m[0].length, joined: m[0].replace(SEPARATOR, ""), evm: true });
  }
  for (const m of text.matchAll(SOLANA_SPLIT)) {
    const groups = m[0].split(/[ _]/);
    const joined = groups.join("");
    if (joined.length < SOLANA_MIN || joined.length > SOLANA_MAX || !groups.every((g) => /\d/.test(g))) continue;
    if (out.some((s) => m.index < s.end && m.index + m[0].length > s.start)) continue;
    out.push({ start: m.index, end: m.index + m[0].length, joined, evm: false });
  }
  return out.sort((a, b) => a.start - b.start);
}
