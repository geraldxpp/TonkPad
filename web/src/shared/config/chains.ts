import type { Chain, ChainId } from "@/shared/types/chain";

export const CHAINS: Record<ChainId, Chain> = {
  sol: {
    id: "sol",
    name: "Solana",
    letter: "S",
    background: "linear-gradient(135deg, #9945FF, #19FB9B)",
    foreground: "#0B0A1A",
    quickBuy: { amount: "0.5", unit: "SOL" },
  },
  rh: {
    id: "rh",
    name: "Robinhood Chain",
    letter: "R",
    background: "#CCFF00",
    foreground: "#0E1400",
    quickBuy: { amount: "0.01", unit: "ETH" },
  },
};

export const CHAIN_IDS: readonly ChainId[] = ["sol", "rh"];

export function isChainId(value: string | null | undefined): value is ChainId {
  return value === "sol" || value === "rh";
}
