import type { ChainId } from "@/shared/types/chain";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const EVM = /^0x[\da-fA-F]{40}$/;

/** One 0x-prefixed, 20-byte EVM address (any letter case). */
export function isEvmAddress(address: string): boolean {
  return EVM.test(address);
}

/** A base58-encoded 32-byte Solana public key. */
export function isSolanaAddress(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  let value = BigInt(0);
  for (const character of address) value = value * BigInt(58) + BigInt(BASE58.indexOf(character));
  const leading = address.match(/^1*/)?.[0].length ?? 0;
  return leading + (value === BigInt(0) ? 0 : Math.ceil(value.toString(16).length / 2)) === 32;
}

/** An address in the format of the given chain: Solana or Robinhood Chain (EVM). */
export function isChainAddress(chain: ChainId, address: string): boolean {
  return chain === "sol" ? isSolanaAddress(address) : isEvmAddress(address);
}

/** "0x5e1d7c…a0f3" → "0x5e1d…a0f3"; Solana addresses keep 4 + 4 like the rest of the app. */
export function shortAddress(address: string): string {
  if (address.length <= 13) return address;
  return address.startsWith("0x") ? `${address.slice(0, 6)}…${address.slice(-4)}` : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** EVM addresses compare without case; Solana's base58 is case-sensitive. */
export function sameAddress(left: string, right: string): boolean {
  return isEvmAddress(right) ? left.toLowerCase() === right.toLowerCase() : left === right;
}
