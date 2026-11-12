import { encodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { LAUNCHPAD_EVENTS, LAUNCHPAD_VIEWS, MIGRATOR_EVENTS, MIGRATOR_VIEWS, UNISWAP_EVENTS } from "../src/alerts/abi";
import type { RpcCall, RpcReply } from "../src/alerts/rpc";
import { type Address, hexOf, type RawLog, type RawReceipt, type RawTx } from "../src/alerts/types";
import { built, ETH, GUARD, LAUNCHPAD, MIGRATOR, POOL_MANAGER, POSITION_MANAGER } from "./alerts-fixtures";

const BPS = BigInt(10_000);
const big = (n: number | string) => BigInt(n);

export const TOKEN: Address = "0x5e1d00000000000000000000000000000000c0de";
export const CREATOR: Address = "0xc0ffee0000000000000000000000000000000001";
export const SNIPER: Address = "0x5419e7000000000000000000000000000000beef";
export const BUYER: Address = "0xb0b0000000000000000000000000000000000b0b";
export const LAUNCH_TX = `0x${"a1".repeat(32)}`;
export const SHIELD_TX = `0x${"a2".repeat(32)}`;
export const GRADUATION = `0x${"a3".repeat(32)}`;

/**
 * The mainnet build's numbers, worked from its code (F-1 and F-2): a launch
 * with 2% Crew Rewards, a buy of 1 ETH + 1 wei in the launch block's shield
 * (its 99% tax rounded up and burned to 0xdead, and no Crew fee while under
 * the 10M-token floor), then a 3 ETH buy capped at 2.5 ETH that completes the
 * curve and graduates it on its curve-backed ETH only.
 */
export function shieldNumbers() {
  const value = ETH + big(1);
  const penalty = (value * big(9_900) + big(9_999)) / BPS;
  const gross = value - penalty;
  const protocol = (gross * big(100)) / BPS;
  const net = gross - protocol;
  const value2 = ETH * big(3);
  const gross2 = (ETH * big(5)) / big(2);
  const [protocol2, crew2] = [(gross2 * big(100)) / BPS, (gross2 * big(200)) / BPS];
  const curve = net + gross2 - protocol2 - crew2;
  const fee = (curve * big(100)) / BPS;
  const bonus = (curve * big(50)) / BPS;
  const liquidity = curve - fee - bonus;
  return { value, penalty, gross, protocol, net, value2, gross2, protocol2, crew2, refund: value2 - gross2, curve, fee, bonus, liquidity };
}

const trade = (trader: Address, gross: bigint, protocolFee: bigint, crewFee: bigint, remaining: bigint) => ({
  token: TOKEN, trader, isBuy: true, grossEth: gross, tokenAmount: big(1), protocolFee, crewFee, creatorFee: big(0), newVirtualEth: big(1), newVirtualTokens: big(1), remainingCurveTokens: remaining,
});

/** The three transactions' launchpad and migrator logs, from `block`. */
export function shieldLogs(block: number): { launch: RawLog[]; shield: RawLog[]; graduation: RawLog[] } {
  const n = shieldNumbers();
  const at = (tx: string, b: number, logIndex: number) => ({ address: LAUNCHPAD, tx, block: b, logIndex });
  const launched = { token: TOKEN, creator: CREATOR, name: "Shield", symbol: "SHLD", metadataUri: "", crewFeeBps: 200, creatorFeeBps: 0, lockType: 0, lockedBps: 0, lockEnd: big(0), devBuyEth: big(0) };
  return {
    launch: [built(LAUNCHPAD_EVENTS, "MissionLaunched", launched, at(LAUNCH_TX, block, 0))],
    shield: [
      built(LAUNCHPAD_EVENTS, "BundleTaxCollected", { token: TOKEN, sniper: SNIPER, penaltyEth: n.penalty }, at(SHIELD_TX, block + 1, 0)),
      built(LAUNCHPAD_EVENTS, "CurveTrade", trade(SNIPER, n.gross, n.protocol, big(0), ETH * big(700_000_000)), at(SHIELD_TX, block + 1, 1)),
    ],
    graduation: [
      built(LAUNCHPAD_EVENTS, "CurveTrade", trade(BUYER, n.gross2, n.protocol2, n.crew2, big(0)), at(GRADUATION, block + 30, 0)),
      built(MIGRATOR_EVENTS, "PoolGraduatedAndLocked", { token: TOKEN, positionTokenId: big(7), ethSeeded: n.liquidity - big(1), tokensSeeded: ETH * big(200_000_000), poolFee: 30_000 }, { ...at(GRADUATION, block + 30, 3), address: MIGRATOR }),
      built(MIGRATOR_EVENTS, "MigrationRemainderHandled", { token: TOKEN, ethToTreasury: big(1), tokensToDeadAddress: big(0) }, { ...at(GRADUATION, block + 30, 4), address: MIGRATOR }),
      built(LAUNCHPAD_EVENTS, "MissionGraduated", { token: TOKEN, dexPoolOrPosition: MIGRATOR, ethLiquidity: n.liquidity, tokenLiquidity: ETH * big(200_000_000), creatorGradBonus: n.bonus }, at(GRADUATION, block + 30, 5)),
    ],
  };
}

/** The graduation's receipt (the guarded pool initialized, the position minted to the migrator) and its transaction. */
export function graduationReceipt(block: number): { receipt: RawReceipt; tx: RawTx } {
  const ids = { tx: GRADUATION, block: block + 30 };
  const initialize = built(UNISWAP_EVENTS, "Initialize", { id: `0x${"11".repeat(32)}`, currency0: "0x0000000000000000000000000000000000000000", currency1: TOKEN, fee: 30_000, tickSpacing: 60, hooks: GUARD, sqrtPriceX96: big(1) << big(96), tick: 0 }, { ...ids, address: POOL_MANAGER, logIndex: 1 });
  const minted = built(UNISWAP_EVENTS, "Transfer", { from: "0x0000000000000000000000000000000000000000", to: MIGRATOR, id: big(7) }, { ...ids, address: POSITION_MANAGER, logIndex: 2 });
  return {
    receipt: { transactionHash: GRADUATION, blockNumber: hexOf(block + 30), status: "0x1", from: BUYER, to: LAUNCHPAD, logs: [...shieldLogs(block).graduation, initialize, minted] },
    tx: { hash: GRADUATION, from: BUYER, to: LAUNCHPAD, value: hexOf(shieldNumbers().value2), input: "0x" },
  };
}

/** Answers the chain's own reads for the scenario's token: its curve (real ETH, progress, graduated) and, once graduated, its locked position. */
export function scenarioReads(block: number, curve: () => { realEth: bigint; progressBps: number; graduated: boolean }): (call: RpcCall) => RpcReply | undefined {
  const call = (abi: typeof LAUNCHPAD_VIEWS | typeof MIGRATOR_VIEWS, functionName: string, args: readonly unknown[]) => encodeFunctionData({ abi, functionName, args } as never) as Hex;
  const telemetry = call(LAUNCHPAD_VIEWS, "getMissionTelemetry", [TOKEN]);
  const locked = call(MIGRATOR_VIEWS, "lockedPositions", [TOKEN]);
  const floor = call(LAUNCHPAD_VIEWS, "CREW_ELIGIBLE_FLOOR", []);
  return (rpc) => {
    const data = rpc.method === "eth_call" ? (rpc.params[0] as { data: string }).data : null;
    if (data === floor) return { result: encodeFunctionResult({ abi: LAUNCHPAD_VIEWS, functionName: "CREW_ELIGIBLE_FLOOR", result: ETH * big(10_000_000) }) };
    if (data === telemetry) {
      const { realEth, progressBps, graduated } = curve();
      return { result: encodeFunctionResult({ abi: LAUNCHPAD_VIEWS, functionName: "getMissionTelemetry", result: [big(1), big(1), big(progressBps), realEth, big(0), big(0), big(0), graduated] }) };
    }
    if (data === locked) return { result: encodeFunctionResult({ abi: MIGRATOR_VIEWS, functionName: "lockedPositions", result: [TOKEN, CREATOR, big(7), 200, 0, 30_000, big(0), big(0), true] }) };
    if (rpc.method === "eth_getTransactionReceipt" && rpc.params[0] === GRADUATION) return { result: graduationReceipt(block).receipt };
    if (rpc.method === "eth_getTransactionByHash" && rpc.params[0] === GRADUATION) return { result: graduationReceipt(block).tx };
    return undefined;
  };
}
