import type { ChainId } from "@/shared/types/chain";
import type { LiveStatus } from "@/shared/types/live";

export interface TapeItem {
  /** Contract address (live tokens); the ticker keys mock items. */
  address?: string;
  ticker: string;
  art: string;
  marketCap: number;
  change24h: number;
}

export type ChainFilterValue = "all" | ChainId;

export interface ShellData {
  tape: TapeItem[];
  chainCounts: Record<ChainFilterValue, number>;
  /** null while a live value hasn't arrived yet. */
  status: LiveStatus;
}

/** Mock data for the chrome shared by every screen (ported from the reference). */
export const SHELL_MOCK: ShellData = {
  tape: [
    { ticker: "GHOST", art: "/tokens/ghost.svg", marketCap: 58_200, change24h: 412.6 },
    { ticker: "SCAT", art: "/tokens/scat.svg", marketCap: 1_180_000, change24h: 96.4 },
    { ticker: "ORB", art: "/tokens/orb.svg", marketCap: 64_100, change24h: 221.0 },
    { ticker: "MOON", art: "/tokens/moon.svg", marketCap: 864_000, change24h: 38.2 },
    { ticker: "SHRM", art: "/tokens/shrm.svg", marketCap: 37_400, change24h: -12.4 },
    { ticker: "BOLT", art: "/tokens/bolt.svg", marketCap: 276_000, change24h: 64.9 },
    { ticker: "LUMEN", art: "/tokens/lumen.svg", marketCap: 21_300, change24h: -8.1 },
    { ticker: "KITE", art: "/tokens/kite.svg", marketCap: 19_000, change24h: 17.3 },
  ],
  chainCounts: { all: 8_412, sol: 5_941, rh: 2_471 },
  status: { solUsd: 182.4, ethUsd: 3_412, rhGasGwei: 0.02 },
};
