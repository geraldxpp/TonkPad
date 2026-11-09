/**
 * The bridge dialog's simulated quotes (phase 1), worked out so Ghosty shows
 * the export's figures: 853.40 USDC from Base, 0.2512 ETH from Ethereum,
 * 4.68 SOL from Solana for 0.25 ETH on Robinhood Chain.
 */
import type { ChainId } from "@/shared/types/chain";

export type BridgeSource = "base" | "arb" | "eth" | ChainId;

export interface SourceInfo {
  name: string;
  /** Letter mark for chains the app has no logo for (Base, Arbitrum, Ethereum); their brand colours. */
  letter: string;
  background: string;
  foreground: string;
  /** What leaves the source chain, and its USD price. */
  coin: string;
  usd: number;
  decimals: number;
  provider: "Relay" | "Across";
  /** Seconds. */
  eta: number;
  /** Bridge fee and gas as a share of the amount. */
  cost: number;
}

export const SOURCES: Record<BridgeSource, SourceInfo> = {
  base: { name: "Base", letter: "B", background: "#2A5BFF", foreground: "#FFFFFF", coin: "USDC", usd: 1, decimals: 2, provider: "Relay", eta: 15, cost: 0.00047 },
  arb: { name: "Arbitrum", letter: "A", background: "#2D86D9", foreground: "#FFFFFF", coin: "USDC", usd: 1, decimals: 2, provider: "Across", eta: 15, cost: 0.00047 },
  eth: { name: "Ethereum", letter: "E", background: "#6F7CF6", foreground: "#FFFFFF", coin: "ETH", usd: 3_412, decimals: 4, provider: "Relay", eta: 30, cost: 0.0048 },
  sol: { name: "Solana", letter: "S", background: "", foreground: "", coin: "SOL", usd: 182.4, decimals: 2, provider: "Relay", eta: 20, cost: 0.0005 },
  rh: { name: "Robinhood Chain", letter: "R", background: "", foreground: "", coin: "ETH", usd: 3_412, decimals: 4, provider: "Relay", eta: 15, cost: 0.00047 },
};

/** What a bridge lands on the token's chain, in its coin. */
export const LANDS: Record<ChainId, number> = { rh: 0.25, sol: 5 };

/** Where funds can come from: three EVM chains and the app's other chain. */
export function sourcesFor(chain: ChainId): BridgeSource[] {
  return ["base", "arb", "eth", chain === "rh" ? "sol" : "rh"];
}

/** "853.40 USDC" from Base for 0.25 ETH on Robinhood Chain. */
export function sendAmount(source: BridgeSource, to: ChainId, nativeUsd: number): string {
  const info = SOURCES[source];
  const amount = (LANDS[to] * nativeUsd * (1 + info.cost)) / info.usd;
  return `${amount.toFixed(info.decimals)} ${info.coin}`;
}
