import type { TokenDetail } from "@/shared/types/token-detail";
import { GHOSTY } from "../data/ghosty.mock";

export const LIVE_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
export const OTHER_ADDRESS = "0xabcdef1234567890abcdef1234567890abcdef12";
export const SOL_ADDRESS = "So11111111111111111111111111111111111111112";

export function liveDetail(address = LIVE_ADDRESS): TokenDetail {
  return {
    ...GHOSTY,
    source: "live",
    token: { ...GHOSTY.token, address, name: "Live token", chain: address.startsWith("0x") ? "rh" : "sol" },
    contract: address,
    priceUsd: null,
    supply: null,
    nativeUsd: null,
    trades: [],
    holders: [],
    topTraders: [],
    crew: null,
    devLock: null,
    agent: null,
    flow1h: null,
  };
}

export const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });
