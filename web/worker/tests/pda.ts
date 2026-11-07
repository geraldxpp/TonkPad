import { createHash } from "node:crypto";
import { base58Decode, base58Encode, isOnCurve } from "../src/solana";

/**
 * Program address derivation, for tests only. Solana tries bumps from 255
 * down and keeps the first hash that is off the curve, so deriving the same
 * address as the chain checks isOnCurve's answer for every bump it tried.
 */
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

function key(address: string): Uint8Array {
  const bytes = base58Decode(address);
  if (!bytes || bytes.length !== 32) throw new Error(`not a key: ${address}`);
  return bytes;
}

export function findProgramAddress(seeds: readonly Uint8Array[], programId: string): string {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash("sha256");
    for (const seed of seeds) hash.update(seed);
    hash.update(Uint8Array.of(bump));
    hash.update(key(programId));
    hash.update("ProgramDerivedAddress");
    const candidate = new Uint8Array(hash.digest());
    if (!isOnCurve(candidate)) return base58Encode(candidate);
  }
  throw new Error("no program address");
}

/** The associated token account of `owner` for `mint`. */
export function associatedTokenAddress(owner: string, mint: string, tokenProgram: string): string {
  return findProgramAddress([key(owner), key(tokenProgram), key(mint)], ATA_PROGRAM);
}
