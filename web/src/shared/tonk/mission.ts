import type { DevLockState } from "./lock";
import type { AgentSettings } from "./metadata";
import type { LockType } from "./rules";
import type { UnsignedTx } from "./types";

/** A creator's lock as JSON: wei amounts are decimal strings, times unix seconds. */
export interface MissionLockJson {
  type: LockType;
  lockedBps: number;
  start: number;
  end: number;
  total: string;
  claimed: string;
  checkpoint: string;
}

/** A mission read from the launchpad and its token. Wei amounts are decimal strings. */
export interface MissionJson {
  chainId: number;
  token: string;
  name: string;
  symbol: string;
  creator: string;
  /** Unix seconds, and the L2 block, of the launch. */
  launchedAt: number;
  launchBlock: number;
  crewBps: number;
  creatorBps: number;
  graduated: boolean;
  /** The launchpad's owner has paused it: launches and curve buys stop. */
  paused: boolean;
  /**
   * Whether a holder can sell back to the curve right now. A build with patch A (12 Nov 2026) keeps sells open
   * while paused; earlier builds stop them too. Read from the contract itself; absent on older answers.
   */
  sellingOpen?: boolean;
  virtualEth: string;
  virtualTokens: string;
  realEth: string;
  tokensLeft: string;
  /** Tokens held by wallets that earn Crew Rewards. While it is below `crewFloor`, no Crew fee is charged. */
  eligibleSupply: string;
  /** The eligible supply from which the contract charges the Crew fee: 10M tokens (1% of supply) on builds with the floor, 1 on earlier ones; absent from older answers. */
  crewFloor?: string;
  /** ETH delivered to holders so far. */
  crewPaid: string;
  /** The stored details and agent brief exactly as on-chain: untrusted text. */
  metadata: string;
  agentPrompt: string;
  lock: MissionLockJson | null;
  /** Tokens in the creator's wallet. */
  creatorHeld: string;
  /** The L2 block this read saw. Ordinary buys in the launch block and the next lose 99%. */
  block: number;
  /** Once graduated, where graduated pools trade: the Uniswap pool's id, which a pool trade's receipt is matched to. */
  pool?: string | null;
  buyingOpen: boolean;
  /** ms */
  readAt: number;
}

/** One curve trade, from its CurveTrade event. */
export interface MissionTradeJson {
  /** Transaction hash and log index. */
  id: string;
  tx: string;
  side: TradeSide;
  trader: string;
  /** Gross ETH and tokens, in wei, and the fees taken out of that ETH. */
  eth: string;
  tokens: string;
  fees: string;
  /** The curve's reserves just after it. */
  virtualEth: string;
  virtualTokens: string;
  block: number;
  /** Unix seconds. */
  time: number;
}

/** What the token page reads: GET /api/tonk/token/<address>. */
export interface MissionPageJson {
  mission: MissionJson;
  /** Newest first. */
  trades: MissionTradeJson[];
}

/** A wallet's standing on one mission: GET /api/tonk/account. */
export interface MissionAccountJson {
  owner: string;
  eth: string;
  tokens: string;
  /** What the launchpad may take from the wallet for a sell. */
  allowance: string;
  unpaidRewards: string;
  /** ETH the launchpad holds for the wallet after a delivery failed. */
  unpaidEth: string;
  /** The token leaves this wallet out of the eligible supply (the launchpad and a few system addresses); absent from older answers. */
  crewExcluded?: boolean;
  isCreator: boolean;
  readAt: number;
}

/** A launch in the latest-launches list: GET /api/tonk/missions. */
export interface MissionSummaryJson {
  token: string;
  name: string;
  symbol: string;
  creator: string;
  block: number;
  time: number;
}

export type TradeSide = "buy" | "sell";

/** A curve trade as the browser asks the server to build it: POST /api/tonk/trade. */
export interface TradeRequest {
  token: string;
  trader: string;
  side: TradeSide;
  /** Wei: ETH for a buy, tokens for a sell. */
  amount: string;
  /** The least the trader accepts of what they receive, in wei. */
  minOut: string;
  referrer: string | null;
  /** A sale's confirmed approval: the server builds the sale no earlier than its block. */
  approval?: string | null;
}

/** A trade worked out from a mission's state, with the contract's own maths. */
export interface TradeQuoteJson {
  side: TradeSide;
  amountIn: string;
  out: string;
  minOut: string;
  protocolFee: string;
  crewFee: string;
  creatorFee: string;
  /** Buy: ETH sent back when the buy completes the curve. */
  refund: string;
  completesCurve: boolean;
  /** Sell: the payout was limited to the ETH really in the curve. */
  capped: boolean;
}

/** The server's answer: the price moved past the minimum, an approval is needed first, or the trade itself. Nothing is sent. */
export type TradeBuild =
  | { step: "moved"; mission: MissionJson }
  | { step: "approve"; tx: UnsignedTx; mission: MissionJson }
  | { step: "trade"; tx: UnsignedTx; quote: TradeQuoteJson; mission: MissionJson };

/** What a creator or holder can do besides trading: POST /api/tonk/action. */
export type ActionRequest =
  | { kind: "claim"; token: string; owner: string }
  | { kind: "extend"; token: string; owner: string; days: number }
  | { kind: "edit"; token: string; owner: string; description: string; x: string; telegram: string; website: string; agent: AgentSettings | null }
  | { kind: "rewards"; token: string; owner: string }
  | { kind: "share"; token: string; owner: string }
  | { kind: "withdraw"; owner: string };
export type ActionKind = ActionRequest["kind"];

export interface ActionBuild {
  tx: UnsignedTx;
}

/** What a confirmed transaction did, from its own events. */
export type TxEventJson =
  | { kind: "trade"; token: string; trader: string; side: TradeSide; eth: string; tokens: string; protocolFee: string; crewFee: string; creatorFee: string }
  | { kind: "graduated"; token: string }
  | { kind: "approved"; token: string; owner: string; amount: string }
  | { kind: "claimed"; token: string; amount: string }
  | { kind: "extended"; token: string; lockEnd: number }
  | { kind: "edited"; token: string }
  | { kind: "rewards"; token: string; holder: string; amount: string }
  | { kind: "withdrawn"; recipient: string; amount: string }
  /** A graduated pool's fees, shared by its migrator: the ETH side split three ways, the token side out of circulation. */
  | { kind: "shared"; token: string; protocolEth: string; crewEth: string; creatorEth: string; tokensBurned: string }
  // A swap on a graduated token's Uniswap pool, from the PoolManager's own Swap event: ETH and tokens in wei.
  | { kind: "pool"; pool: string; side: TradeSide; eth: string; tokens: string };

/** A stored lock in the launchpad's own units, for the lock maths. */
export function missionLock(lock: MissionLockJson): DevLockState {
  return { type: lock.type, lockedBps: lock.lockedBps, start: lock.start, end: lock.end, total: BigInt(lock.total), claimed: BigInt(lock.claimed), checkpoint: BigInt(lock.checkpoint) };
}

/** Whether a holder can sell back to this mission's curve now: on any build, from the contract's own answer. */
export const canSell = (mission: Pick<MissionJson, "paused" | "sellingOpen">): boolean => mission.sellingOpen ?? !mission.paused;
