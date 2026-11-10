import { isTestnetSite, TONK_TESTNET } from "@/shared/tonk/networks";
import type { Chain, ChainId } from "@/shared/types/chain";

export const CHAINS: Record<ChainId, Chain> = {
  sol: {
    id: "sol",
    name: "Solana",
    logo: "/chains/sol.png",
    letter: "S",
    background: "linear-gradient(135deg, #9945FF, #19FB9B)",
    foreground: "#0B0A1A",
  },
  rh: {
    id: "rh",
    // On the testnet site every `rh` in the app is the testnet.
    name: isTestnetSite() ? TONK_TESTNET.name : "Robinhood Chain",
    logo: "/chains/rh.png",
    letter: "R",
    background: "#CCFF00",
    foreground: "#0E1400",
  },
};

export const CHAIN_IDS: readonly ChainId[] = ["sol", "rh"];

/** The chains a wallet can connect on: both, or only Robinhood Chain Testnet on the testnet site. */
export const WALLET_CHAIN_IDS: readonly ChainId[] = isTestnetSite() ? ["rh"] : CHAIN_IDS;

export function isChainId(value: string | null | undefined): value is ChainId {
  return value === "sol" || value === "rh";
}
