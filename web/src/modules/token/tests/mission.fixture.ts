import type { MissionAccountJson, MissionJson, MissionTradeJson } from "@/shared/tonk/mission";
import type { AccountView } from "../hooks/useMissionAccount";

export const TOKEN = "0xEaC30db90c3ac240D0122a07e46be8C161051A8A";
export const CREATOR = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f";
export const BUYER = "0x3333333333333333333333333333333333333333";
export const DAY = 86_400;
/** The launch block's time: where the lock starts. */
export const LAUNCHED = 1_794_308_686;

/** The owner's first test launch as the chain held it on 10 Nov 2026, read 70 minutes after launch. */
export function mission(patch: Partial<MissionJson> = {}): MissionJson {
  return {
    chainId: 46630,
    token: TOKEN,
    name: "Tonk Test One",
    symbol: "TTONE",
    creator: CREATOR,
    launchedAt: LAUNCHED,
    launchBlock: 151_319_782,
    crewBps: 200,
    creatorBps: 100,
    graduated: false,
    paused: false,
    virtualEth: "1696000000000000",
    virtualTokens: "948997641509433962264150943",
    realEth: "196000000000000",
    tokensLeft: "675997641509433962264150943",
    eligibleSupply: "124002358490566037735849057",
    crewPaid: "0",
    metadata: "",
    agentPrompt: "",
    lock: { type: "linear", lockedBps: 8000, start: LAUNCHED, end: LAUNCHED + 180 * DAY, total: "99201886792452830188679245", claimed: "0", checkpoint: "0" },
    creatorHeld: "24800471698113207547169812",
    block: 151_327_091,
    buyingOpen: true,
    readAt: (LAUNCHED + 4_200) * 1000,
    ...patch,
  };
}

/** The creator's buy inside the launch: 0.0002 test ETH for 124,002,358.49 tokens, no Crew fee (nobody held the token yet). */
export const LAUNCH_BUY: MissionTradeJson = {
  id: `0x${"c1".repeat(32)}:3`,
  tx: `0x${"c1".repeat(32)}`,
  side: "buy",
  trader: CREATOR,
  eth: "200000000000000",
  tokens: "124002358490566037735849057",
  fees: "4000000000000",
  virtualEth: "1696000000000000",
  virtualTokens: "948997641509433962264150943",
  block: 151_319_782,
  time: LAUNCHED,
};

/** A wallet's standing on the mission. */
export function account(patch: Partial<MissionAccountJson> = {}): MissionAccountJson {
  return { owner: BUYER, eth: "10000000000000000", tokens: "0", allowance: "0", unpaidRewards: "0", unpaidEth: "0", isCreator: false, readAt: 1, ...patch };
}

export function view(patch: Partial<MissionAccountJson> | null = {}): AccountView {
  const standing = patch === null ? null : account(patch);
  return { owner: standing?.owner ?? null, account: standing, loading: false, failed: false, refresh: () => undefined };
}
