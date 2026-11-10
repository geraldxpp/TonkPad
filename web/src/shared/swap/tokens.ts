import type { ChainId } from "@/shared/types/chain";
import type { SwapToken } from "@/shared/types/swap";

/** Jupiter's wrapped-SOL mint, which stands for native SOL in quotes. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** 0x's placeholder for a chain's native coin. */
export const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** Robinhood Chain's dollar stablecoin (Paxos USDG, 6 decimals) and wrapped ETH. */
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

/** The coins every list starts with, per chain: the native coin first, then stables. */
export const BASE_TOKENS: Record<ChainId, readonly SwapToken[]> = {
  sol: [
    { chain: "sol", address: SOL_MINT, symbol: "SOL", name: "Solana", decimals: 9, icon: "/chains/sol.png", native: true },
    { chain: "sol", address: USDC_MINT, symbol: "USDC", name: "USD Coin", decimals: 6, icon: "/coins/usdc.svg" },
  ],
  rh: [
    { chain: "rh", address: NATIVE_EVM, symbol: "ETH", name: "Ether", decimals: 18, icon: "/coins/eth.svg", native: true },
    { chain: "rh", address: USDG, symbol: "USDG", name: "Global Dollar", decimals: 6, icon: "/coins/usdg.svg" },
    { chain: "rh", address: WETH, symbol: "WETH", name: "Wrapped Ether", decimals: 18, icon: "/coins/eth.svg" },
  ],
};

/** The default pair on a chain: its coin into its stablecoin. */
export const DEFAULT_PAIR: Record<ChainId, readonly [string, string]> = {
  sol: [SOL_MINT, USDC_MINT],
  rh: [NATIVE_EVM, USDG],
};

/** Addresses compare without letter case on Robinhood Chain; Solana's are case-sensitive. */
export function sameAddress(chain: ChainId, a: string, b: string): boolean {
  return chain === "rh" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function baseToken(chain: ChainId, address: string): SwapToken | undefined {
  return BASE_TOKENS[chain].find((token) => sameAddress(chain, token.address, address));
}

/** The chain's coin (SOL, ETH). */
export function nativeToken(chain: ChainId): SwapToken {
  return BASE_TOKENS[chain][0];
}

/** Where a transaction can be looked up. */
export function explorerTx(chain: ChainId, tx: string): string {
  return chain === "sol" ? `https://solscan.io/tx/${tx}` : `https://robinhoodchain.blockscout.com/tx/${tx}`;
}
