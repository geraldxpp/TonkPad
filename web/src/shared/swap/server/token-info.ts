import type { ChainId } from "@/shared/types/chain";
import type { SwapToken } from "@/shared/types/swap";
import { jsonRpc } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import { baseToken } from "../tokens";
import { cached } from "./cache";
import { swapConfig } from "./config";
import { jupiterToken } from "./jupiter";

const SELECTORS = { name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567" } as const;

/** Printable text only: drops NUL padding and other control characters. */
const printable = (raw: string) =>
  [...raw]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .trim() || null;

/** An ABI-encoded string return (offset, length, bytes); older tokens return a bytes32 instead. */
export function decodeAbiString(hex: string): string | null {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length === 64) return printable(Buffer.from(body, "hex").toString("utf8"));
  if (body.length < 128) return null;
  const length = Number.parseInt(body.slice(64, 128), 16);
  if (!Number.isSafeInteger(length) || length > 256 || body.length < 128 + length * 2) return null;
  return printable(Buffer.from(body.slice(128, 128 + length * 2), "hex").toString("utf8"));
}

async function evmToken(address: string): Promise<SwapToken | null> {
  const rpc = jsonRpc(walletRpcUrl("rh"));
  const call = (data: string) => rpc("eth_call", [{ to: address, data }, "latest"]).catch(() => null);
  const [name, symbol, decimals] = await Promise.all([call(SELECTORS.name), call(SELECTORS.symbol), call(SELECTORS.decimals)]);
  const places = typeof decimals === "string" && /^0x[\da-fA-F]+$/.test(decimals) ? Number(BigInt(decimals)) : NaN;
  const ticker = typeof symbol === "string" ? decodeAbiString(symbol) : null;
  if (!ticker || !Number.isInteger(places) || places < 0 || places > 36) return null;
  return {
    chain: "rh",
    address,
    symbol: ticker.slice(0, 16),
    name: ((typeof name === "string" ? decodeAbiString(name) : null) ?? ticker).slice(0, 48),
    decimals: places,
    icon: null,
  };
}

async function solanaToken(mint: string): Promise<SwapToken | null> {
  const found = await jupiterToken(mint, swapConfig().jupiterKey);
  return found ? { chain: "sol", address: mint, ...found, symbol: found.symbol.slice(0, 16), name: found.name.slice(0, 48) } : null;
}

/**
 * A token's symbol, name and decimals (the base list first, then Jupiter for
 * Solana or the contract itself on Robinhood Chain), kept for an hour.
 */
export function tokenInfo(chain: ChainId, address: string): Promise<SwapToken | null> {
  const known = baseToken(chain, address);
  if (known) return Promise.resolve(known);
  const key = `token:${chain}:${chain === "rh" ? address.toLowerCase() : address}`;
  return cached(key, 60 * 60_000, () => (chain === "sol" ? solanaToken(address) : evmToken(address)));
}
