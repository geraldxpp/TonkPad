import { STUB_WALLET } from "./fixtures";

/**
 * The missions the fixture's launchpad holds, for the token page's tests.
 * Their launch is the owner's first real one (10 Nov 2026, 11:04:46 UTC), so
 * it is always in the past when the suite runs. Wei amounts as strings.
 */
export const LAUNCHED = 1_794_308_686;
export const DAY = 86_400;
/** The fixture chain's current L2 block. */
export const BLOCK = 151_400_000;
/** The owner's wallet: the creator of every mission but the stub wallet's own. */
export const OWNER = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f";
export const ZERO = "0x0000000000000000000000000000000000000000";

export interface FixtureTrade {
  tx: string;
  block: number;
  time: number;
  trader: string;
  isBuy: boolean;
  eth: string;
  tokens: string;
  protocolFee: string;
  crewFee: string;
  creatorFee: string;
  virtualEth: string;
  virtualTokens: string;
  left: string;
}

export interface FixtureMission {
  token: string;
  name: string;
  symbol: string;
  creator: string;
  launchedAt: number;
  launchBlock: number;
  crewBps: number;
  creatorBps: number;
  graduated: boolean;
  virtualEth: string;
  virtualTokens: string;
  realEth: string;
  tokensLeft: string;
  metadata: string;
  agentPrompt: string;
  /** devLocks: type (0 none, 1 time, 2 linear), bps, start, end, total, claimed. */
  lock: [number, number, number, number, string, string];
  eligibleSupply: string;
  crewPaid: string;
  /** Tokens in the creator's wallet. */
  creatorHeld: string;
  /** The stub wallet's standing on it. */
  stub: { tokens: string; allowance: string; unpaidRewards: string };
  trades: FixtureTrade[];
}

const NO_LOCK: FixtureMission["lock"] = [0, 0, 0, 0, "0", "0"];
const BOUGHT = "124002358490566037735849057";
const LOCKED = "99201886792452830188679245";
const LIQUID = "24800471698113207547169812";
/** The curve after the owner's launch buy of 0.0002 test ETH: the state of the prompt's check values. */
const AFTER_LAUNCH_BUY = { virtualEth: "1696000000000000", virtualTokens: "948997641509433962264150943", realEth: "196000000000000", tokensLeft: "675997641509433962264150943" };
const launchBuy = (trader: string, block: number, time: number, tx: string): FixtureTrade => ({
  tx,
  block,
  time,
  trader,
  isBuy: true,
  eth: "200000000000000",
  tokens: BOUGHT,
  protocolFee: "2000000000000",
  crewFee: "0",
  creatorFee: "2000000000000",
  virtualEth: AFTER_LAUNCH_BUY.virtualEth,
  virtualTokens: AFTER_LAUNCH_BUY.virtualTokens,
  left: AFTER_LAUNCH_BUY.tokensLeft,
});

/** The owner's token as the chain held it: someone else's mission, on which the stub wallet trades and earns rewards. */
export const TTONE: FixtureMission = {
  token: "0x1111111111111111111111111111111111111111",
  name: "Tonk Test One",
  symbol: "TTONE",
  creator: OWNER,
  launchedAt: LAUNCHED,
  launchBlock: 151_319_782,
  crewBps: 200,
  creatorBps: 100,
  graduated: false,
  ...AFTER_LAUNCH_BUY,
  metadata: "",
  agentPrompt: "",
  lock: [2, 8000, LAUNCHED, LAUNCHED + 180 * DAY, LOCKED, "0"],
  eligibleSupply: BOUGHT,
  crewPaid: "3000000000000",
  creatorHeld: LIQUID,
  stub: { tokens: "30000000000000000000000000", allowance: "0", unpaidRewards: "1000000000000" },
  trades: [launchBuy(OWNER, 151_319_782, LAUNCHED, `0x${"c1".repeat(32)}`)],
};

/** The stub wallet's own mission: a ten-year vest, stored details and an agent brief. Its score and dates hold still for years. */
export const TOWN: FixtureMission = {
  token: "0x2222222222222222222222222222222222222222",
  name: "Stub Town",
  symbol: "TOWN",
  creator: STUB_WALLET,
  launchedAt: LAUNCHED + 600,
  launchBlock: 151_320_500,
  crewBps: 200,
  creatorBps: 100,
  graduated: false,
  ...AFTER_LAUNCH_BUY,
  metadata: '{"v":1,"description":"A town for stubs.","x":"stubtown","website":"https://stub.town/"}',
  agentPrompt: '{"v":1,"name":"Mayor Stub","role":"Town crier","voice":"hype","brief":"Keep the town informed."}',
  lock: [2, 8000, LAUNCHED + 600, LAUNCHED + 600 + 3650 * DAY, LOCKED, "0"],
  eligibleSupply: BOUGHT,
  crewPaid: "0",
  creatorHeld: LIQUID,
  stub: { tokens: LIQUID, allowance: "0", unpaidRewards: "0" },
  trades: [launchBuy(STUB_WALLET, 151_320_500, LAUNCHED + 600, `0x${"c2".repeat(32)}`)],
};

/** A mission whose curve is complete: 800M sold, nothing left, trading over. */
export const GRAD: FixtureMission = {
  token: "0x3333333333333333333333333333333333333333",
  name: "Graduate",
  symbol: "GRAD",
  creator: OWNER,
  launchedAt: LAUNCHED + 1_200,
  launchBlock: 151_321_000,
  crewBps: 0,
  creatorBps: 50,
  graduated: true,
  virtualEth: "5895604395604396",
  virtualTokens: "273000000000000000000000000",
  realEth: "0",
  tokensLeft: "0",
  metadata: "",
  agentPrompt: "",
  lock: NO_LOCK,
  eligibleSupply: "0",
  crewPaid: "0",
  creatorHeld: "0",
  stub: { tokens: "0", allowance: "0", unpaidRewards: "0" },
  trades: [],
};

/** A mission launched in the chain's current block, with no dev buy: buys wait out the launch-block shield. */
export const NEWB: FixtureMission = {
  token: "0x4444444444444444444444444444444444444444",
  name: "Newborn",
  symbol: "NEWB",
  creator: OWNER,
  launchedAt: LAUNCHED + 1_800,
  launchBlock: BLOCK,
  crewBps: 100,
  creatorBps: 50,
  graduated: false,
  virtualEth: "1500000000000000",
  virtualTokens: "1073000000000000000000000000",
  realEth: "0",
  tokensLeft: "800000000000000000000000000",
  metadata: "",
  agentPrompt: "",
  lock: NO_LOCK,
  eligibleSupply: "0",
  crewPaid: "0",
  creatorHeld: "0",
  stub: { tokens: "5000000000000000000000000", allowance: "0", unpaidRewards: "0" },
  trades: [],
};

/** In launch order, oldest first. */
export const MISSIONS = [TTONE, TOWN, GRAD, NEWB] as const;
