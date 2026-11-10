import type { CurveSettings } from "./curve";
import type { AgentSettings } from "./metadata";
import type { LockType } from "./rules";

/** The launchpad's live settings as JSON: wei amounts are decimal strings. */
export interface TonkSettingsJson {
  chainId: number;
  launchFee: string;
  virtualEth: string;
  virtualTokens: string;
  /** The owner has paused launches and curve trading. */
  paused: boolean;
  /** The chain's gas price in wei, when known. */
  gasPrice: string | null;
  readAt: number;
}

export function curveSettings(json: TonkSettingsJson): CurveSettings {
  return { launchFee: BigInt(json.launchFee), virtualEth: BigInt(json.virtualEth), virtualTokens: BigInt(json.virtualTokens) };
}

/** A launch as the browser asks the server to build it: POST /api/tonk/launch. */
export interface LaunchRequest {
  /** The wallet that will sign: the mission's creator. */
  creator: string;
  name: string;
  ticker: string;
  description: string;
  x: string;
  telegram: string;
  website: string;
  /** The initial dev buy in wei ("0" for none). */
  devBuy: string;
  lock: LockType;
  /** Share of the dev buy to lock, 50–100. */
  share: number;
  /** The lock's length in days (a vest's months × 30). */
  days: number;
  crewBps: number;
  creatorBps: number;
  agent: AgentSettings | null;
}

/** An unsigned transaction for the wallet. */
export interface UnsignedTx {
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

/** The server's answer to a launch request: checked against the contract, never sent. */
export interface LaunchBuild {
  tx: UnsignedTx;
  /** The settings the transaction was built on. */
  settings: TonkSettingsJson;
  /** What the dev buy will receive and lock at those settings, in wei. */
  bought: string;
  locked: string;
}

/** A launched mission, read back from its receipt and the contract. */
export interface LaunchedMission {
  token: string;
  creator: string;
  name: string;
  symbol: string;
  crewBps: number;
  creatorBps: number;
  lockType: LockType;
  /** Share of the dev buy that was locked, in basis points. */
  lockedBps: number;
  /** When the lock ends, unix seconds (0 without one). */
  lockEnd: number;
  devBuy: string;
  bought: string;
  locked: string;
  protocolFee: string;
  creatorFee: string;
  block: number;
}

export type LaunchTxState = "pending" | "confirmed" | "failed" | "replaced" | "unknown";

/** Where a launch transaction stands: GET /api/tonk/tx?hash=…. */
export interface LaunchStatus {
  state: LaunchTxState;
  /** The mission it launched; null while unconfirmed, or when the transaction isn't a launch. */
  mission: LaunchedMission | null;
}

export const isTxHash = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);
