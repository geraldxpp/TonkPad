import { buyQuote, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { claimableAt, DAY_SECONDS } from "@/shared/tonk/lock";
import { encodeAgent } from "@/shared/tonk/metadata";
import type { Address } from "../src/alerts/types";
import { FEED_EVENTS, POOL_EVENTS } from "../src/tonk/abi";
import { ZERO_ADDRESS } from "../src/tonk/holders";
import { poolIdOf } from "../src/tonk/reads";
import { NOW } from "./fixtures";
import { ETH, GUARD, LAUNCHPAD, ROUTER, TOKENS, TonkChain } from "./tonk-chain";

/**
 * One launch's story, from the mainnet launchpad's deployment block: a launch
 * with a dev buy locked 80% for 180 days (linear), 2% Crew Rewards, 1%
 * Creator Rewards and an agent; a sniper in the launch block's shield; buys
 * and a sell; a wallet-to-wallet transfer; look-alike events that must not
 * count; a buy that completes the curve and graduates it; the creator's
 * first claim; then buys and sells on the token's own pool, and a swap on a
 * look-alike pool for the same token.
 */
export const START_BLOCK = 112_218_281;
export const LAUNCH_BLOCK = START_BLOCK + 500;
/** In the feed's second window of 10,000 blocks. */
export const GRADUATION_BLOCK = START_BLOCK + 12_600;
export const LAST_BLOCK = GRADUATION_BLOCK + 500;
/** 55 minutes before the tests' "now": a New pair, past its first ten minutes. */
export const LAUNCH_TIME = NOW / 1000 - 55 * 60;

const wallet = (tag: string) => `0x${tag.padStart(40, "0")}` as Address;
export const TOKEN = wallet("70e1c0de0beef");
export const CREATOR = wallet("c0ffee");
export const SNIPER = wallet("519e7");
export const ALICE = wallet("a11ce");
export const BOB = wallet("b0b");
export const CAROL = wallet("ca201");
export const DAVE = wallet("da7e");
export const ERIN = wallet("e214");
export const MALLORY = wallet("ba1d");
const SPOOF = wallet("5900f");
const SPOOF_TOKEN = wallet("5900f70e1");

export const POOL_FEE = 40_000;
/** The pool the migrator seeds for a token: its fee is the 1% protocol fee plus Crew and Creator, the guard its hook. */
export const poolIdFor = (token: Address) => poolIdOf({ currency0: ZERO_ADDRESS, currency1: token, fee: POOL_FEE, tickSpacing: 60, hooks: GUARD });
/** Someone else's pool for the same token: no hook, another fee. Its swaps are never this token's trades. */
export const lookalikeFor = (token: Address) => poolIdOf({ currency0: ZERO_ADDRESS, currency1: token, fee: 3_000, tickSpacing: 60, hooks: ZERO_ADDRESS });
export const POOL_ID = poolIdFor(TOKEN);
export const AGENT = encodeAgent({ name: "Captain Tonk", role: "Navigator", voice: "tactical", brief: "Chart the course." });
/** What the token calls itself: direction marks, zero-width spaces and far too long. */
export const RAW_NAME = `‮ Tonk​ Test   One ${"x".repeat(200)}`;

/** Blocks where the story can be stopped part-way. */
export const MARKS = { traded: LAUNCH_BLOCK + 60, transferred: LAUNCH_BLOCK + 80, graduated: GRADUATION_BLOCK, end: LAST_BLOCK };

const DEV_BUY = ETH / BigInt(20);
const LOCK_DAYS = 180;

function launch(chain: TonkChain, name: string, symbol: string): void {
  const [block, tx] = [LAUNCH_BLOCK, chain.nextTx()];
  chain.transfer(ZERO_ADDRESS, LAUNCHPAD, TOTAL_SUPPLY, block, tx);
  chain.emit(LAUNCHPAD, FEED_EVENTS, "MissionLaunched", {
    token: chain.token, creator: CREATOR, name, symbol, metadataUri: chain.metadataUri, crewFeeBps: 200, creatorFeeBps: 100,
    lockType: 2, lockedBps: 8_000, lockEnd: BigInt(chain.launchTime + LOCK_DAYS * DAY_SECONDS), devBuyEth: DEV_BUY,
  }, block, tx);
  // The creator's buy inside the launch: no shield, no Crew fee (nobody eligible holds yet), held back for the lock.
  const q = buyQuote(chain.curve, DEV_BUY, 0, chain.creatorBps);
  chain.curve = { virtualEth: q.newVirtualEth, virtualTokens: q.newVirtualTokens, tokensLeft: chain.curve.tokensLeft - q.tokensOut, realEth: q.netEthIn };
  chain.curveTrade(CREATOR, true, q.effectiveEthIn, q.tokensOut, { protocol: q.protocolFee, crew: q.crewFee, creator: q.creatorFee }, block, tx);
  const locked = (q.tokensOut * BigInt(8_000)) / BigInt(10_000);
  chain.lock = [2, 8_000, BigInt(chain.launchTime), BigInt(chain.launchTime + LOCK_DAYS * DAY_SECONDS), locked, BigInt(0)];
  chain.transfer(LAUNCHPAD, CREATOR, q.tokensOut - locked, block, tx);
  chain.snapshot(block);
}

/** claimDevTokens: what has vested so far, out of the launchpad to the creator. */
function claim(chain: TonkChain, block: number): void {
  const tx = chain.nextTx();
  const [type, bps, start, end, total, claimed] = chain.lock;
  const amount = claimableAt({ type: "linear", lockedBps: bps, start: Number(start), end: Number(end), total, claimed, checkpoint: BigInt(0) }, chain.timeOf(block));
  chain.lock = [type, bps, start, end, total, claimed + amount];
  chain.transfer(LAUNCHPAD, CREATOR, amount, block, tx);
  chain.emit(LAUNCHPAD, FEED_EVENTS, "DevTokensClaimed", { token: chain.token, creator: CREATOR, amount }, block, tx);
  chain.snapshot(block);
}

/** Events from contracts that aren't ours, naming our token or our pool: none may count. */
function lookalikes(chain: TonkChain, block: number): void {
  const tx = chain.nextTx();
  chain.emit(SPOOF, FEED_EVENTS, "MissionLaunched", { token: SPOOF_TOKEN, creator: SPOOF, name: "Fake", symbol: "FAKE", metadataUri: "", crewFeeBps: 400, creatorFeeBps: 0, lockType: 1, lockedBps: 10_000, lockEnd: BigInt(0), devBuyEth: BigInt(0) }, block, tx);
  chain.emit(SPOOF, FEED_EVENTS, "CurveTrade", { token: chain.token, trader: MALLORY, isBuy: true, grossEth: ETH * BigInt(1_000), tokenAmount: TOKENS, protocolFee: BigInt(0), crewFee: BigInt(0), creatorFee: BigInt(0), newVirtualEth: BigInt(1), newVirtualTokens: BigInt(1), remainingCurveTokens: BigInt(0) }, block, tx);
  chain.transfer(SPOOF, MALLORY, TOKENS * BigInt(500_000_000), block, tx, SPOOF_TOKEN);
}

export interface ScenarioOptions {
  token?: Address;
  name?: string;
  symbol?: string;
  /** Unix seconds; the tests' "now" less 55 minutes by default. */
  launchTime?: number;
  /** What the launch stores as its metadata (its links and image); none by default. */
  metadataUri?: string;
}

export function tonkScenario(options: ScenarioOptions = {}): TonkChain {
  const chain = new TonkChain(options.token ?? TOKEN, LAUNCH_BLOCK, options.launchTime ?? LAUNCH_TIME);
  chain.agentPrompt = AGENT;
  chain.metadataUri = options.metadataUri ?? "";
  launch(chain, options.name ?? RAW_NAME, options.symbol ?? "​TONK");
  chain.buy(SNIPER, ETH / BigInt(10), LAUNCH_BLOCK + 1);
  const bought = chain.buy(ALICE, ETH / BigInt(5), LAUNCH_BLOCK + 12);
  chain.buy(BOB, ETH / BigInt(10), LAUNCH_BLOCK + 25);
  chain.sell(ALICE, bought / BigInt(2), LAUNCH_BLOCK + 60);
  chain.transfer(BOB, CAROL, TOKENS * BigInt(1_000_000), LAUNCH_BLOCK + 80, chain.nextTx());
  lookalikes(chain, LAUNCH_BLOCK + 100);
  chain.buy(DAVE, ETH * BigInt(5), GRADUATION_BLOCK);
  claim(chain, GRADUATION_BLOCK + 100);
  const pool = poolIdFor(chain.token);
  chain.swap(pool, ERIN, true, ETH / BigInt(2), GRADUATION_BLOCK + 200);
  chain.swap(pool, ALICE, false, chain.balances.get(ALICE) ?? BigInt(0), GRADUATION_BLOCK + 300);
  chain.swap(lookalikeFor(chain.token), MALLORY, true, ETH / BigInt(100), GRADUATION_BLOCK + 400, false);
  // Our pool's id, logged by a contract that isn't Uniswap's PoolManager.
  chain.emit(SPOOF, POOL_EVENTS, "Swap", { id: pool, sender: ROUTER, amount0: -ETH, amount1: TOKENS, sqrtPriceX96: BigInt(1), liquidity: BigInt(1), tick: 0, fee: 0 }, LAST_BLOCK, chain.nextTx());
  return chain;
}
