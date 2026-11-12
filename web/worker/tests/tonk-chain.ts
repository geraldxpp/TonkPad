import { type Abi, type AbiEvent, encodeAbiParameters, encodeEventTopics, getAbiItem } from "viem";
import { buyQuote, CURVE_SUPPLY, type MissionCurve, sellQuote, WEI } from "@/shared/tonk/curve";
import { type Address, hexOf, type RawLog } from "../src/alerts/types";
import { FEED_EVENTS, MIGRATOR_FEED_EVENTS, POOL_EVENTS, TOKEN_EVENTS } from "../src/tonk/abi";
import { DEAD, ZERO_ADDRESS } from "../src/tonk/holders";

/**
 * Robinhood Chain in miniature for the feed's tests: one tonkfun.fun launch
 * traded through the mainnet build's own maths (shared/tonk/curve.ts mirrors
 * TonkpadRobinhood.sol to the wei), logging what the contracts log, in their
 * order: the token's Transfers, CurveTrade, the launch-block tax, the
 * graduation's migration, then the pool's Swaps. Mainnet's settings: 1 ETH
 * and 1.073B tokens of virtual reserves.
 */
export const LAUNCHPAD: Address = "0xbcaf0ecf36d15622a13d04b5ac58d312818bb4f0";
export const MIGRATOR: Address = "0x7d233d86fa9d3a36042c2a537276e995c70adc0f";
export const GUARD: Address = "0xbeced0f0600d62de0189da0532e31fe4d868a000";
export const POOL_MANAGER: Address = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const ROUTER: Address = "0x204faca1764b154221e35c0d20abb3c525710498";
export const ETH = WEI;
export const TOKENS = WEI;
const BPS = BigInt(10_000);
const FLOOR = BigInt(10_000_000) * WEI;
const SYSTEM = new Set<string>([LAUNCHPAD, MIGRATOR, POOL_MANAGER, DEAD, ZERO_ADDRESS]);

/** devLocks(token): lockType, lockedBps, start, end, total, claimed. */
export type LockRow = [number, number, bigint, bigint, bigint, bigint];

export class TonkChain {
  readonly logs: RawLog[] = [];
  readonly balances = new Map<string, bigint>();
  curve: MissionCurve = { virtualEth: ETH, virtualTokens: BigInt(1_073_000_000) * WEI, tokensLeft: CURVE_SUPPLY, realEth: BigInt(0) };
  /** The curve, the lock and the graduated flag after each block that changed them. */
  readonly history: Array<{ block: number; curve: MissionCurve; lock: LockRow; graduated: boolean }> = [];
  lock: LockRow = [0, 0, BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
  graduated = false;
  /** The mission's stored agent brief, as missions() returns it. */
  agentPrompt = "";
  /** The pool's reserves once seeded (a plain x·y=k stand-in: the feed reads what Swap logs say). */
  pool = { eth: BigInt(0), tokens: BigInt(0) };
  private serial = 0;
  private readonly index = new Map<number, number>();

  constructor(
    readonly token: Address,
    /** The launch block and its time, unix seconds; blocks follow four a second. */
    readonly launchBlock: number,
    readonly launchTime: number,
    readonly crewBps = 200,
    readonly creatorBps = 100,
  ) {}

  timeOf = (block: number) => this.launchTime + Math.floor((block - this.launchBlock) / 4);
  nextTx = () => `0x${(++this.serial).toString(16).padStart(64, "0")}`;

  emit(address: Address, abi: Abi, eventName: string, args: Record<string, unknown>, block: number, tx: string): void {
    const item = getAbiItem({ abi, name: eventName }) as AbiEvent;
    const plain = item.inputs.filter((input) => !input.indexed);
    const logIndex = this.index.get(block) ?? 0;
    this.index.set(block, logIndex + 1);
    this.logs.push({
      address,
      topics: encodeEventTopics({ abi: [item], eventName, args } as never) as string[],
      data: encodeAbiParameters(plain, plain.map((input) => args[input.name ?? ""])),
      blockNumber: hexOf(block),
      transactionHash: tx,
      logIndex: hexOf(logIndex),
    });
  }

  transfer(from: Address, to: Address, value: bigint, block: number, tx: string, token: Address = this.token): void {
    if (token === this.token) {
      if (from !== ZERO_ADDRESS) this.balances.set(from, (this.balances.get(from) ?? BigInt(0)) - value);
      this.balances.set(to, (this.balances.get(to) ?? BigInt(0)) + value);
    }
    this.emit(token, TOKEN_EVENTS, "Transfer", { from, to, value }, block, tx);
  }

  /** Tokens held by wallets that earn Crew Rewards: the fee is charged only from 10M (F-2). */
  crewNow(): number {
    let eligible = BigInt(0);
    for (const [address, amount] of this.balances) if (!SYSTEM.has(address)) eligible += amount;
    return eligible >= FLOOR ? this.crewBps : 0;
  }

  snapshot(block: number): void {
    this.history.push({ block, curve: { ...this.curve }, lock: [...this.lock], graduated: this.graduated });
  }

  at(block: number) {
    return [...this.history].reverse().find((entry) => entry.block <= block) ?? { block: 0, curve: this.curve, lock: this.lock, graduated: false };
  }

  curveTrade(trader: Address, isBuy: boolean, gross: bigint, tokens: bigint, fees: { protocol: bigint; crew: bigint; creator: bigint }, block: number, tx: string): void {
    const c = this.curve;
    this.emit(LAUNCHPAD, FEED_EVENTS, "CurveTrade", {
      token: this.token, trader, isBuy, grossEth: gross, tokenAmount: tokens, protocolFee: fees.protocol, crewFee: fees.crew, creatorFee: fees.creator,
      newVirtualEth: c.virtualEth, newVirtualTokens: c.virtualTokens, remainingCurveTokens: c.tokensLeft,
    }, block, tx);
  }

  /** A curve buy; inside the launch block or the next, the shield takes 99% first (rounded up) and burns it. */
  buy(buyer: Address, ethIn: bigint, block: number, tx = this.nextTx()): bigint {
    let net = ethIn;
    if (block <= this.launchBlock + 1) {
      const penalty = (ethIn * BigInt(9_900) + BigInt(9_999)) / BPS;
      net -= penalty;
      this.emit(LAUNCHPAD, FEED_EVENTS, "BundleTaxCollected", { token: this.token, sniper: buyer, penaltyEth: penalty }, block, tx);
    }
    const q = buyQuote(this.curve, net, this.crewNow(), this.creatorBps);
    this.curve = { virtualEth: q.newVirtualEth, virtualTokens: q.newVirtualTokens, tokensLeft: this.curve.tokensLeft - q.tokensOut, realEth: this.curve.realEth + q.netEthIn };
    this.transfer(LAUNCHPAD, buyer, q.tokensOut, block, tx);
    this.curveTrade(buyer, true, q.effectiveEthIn, q.tokensOut, { protocol: q.protocolFee, crew: q.crewFee, creator: q.creatorFee }, block, tx);
    if (this.curve.tokensLeft === BigInt(0)) this.graduate(block, tx);
    this.snapshot(block);
    return q.tokensOut;
  }

  /** A curve sell: the tokens move in first, then the Crew fee is decided on what's left eligible. */
  sell(seller: Address, tokensIn: bigint, block: number, tx = this.nextTx()): void {
    this.transfer(seller, LAUNCHPAD, tokensIn, block, tx);
    const q = sellQuote(this.curve, tokensIn, this.crewNow(), this.creatorBps);
    this.curve = { virtualEth: q.newVirtualEth, virtualTokens: q.newVirtualTokens, tokensLeft: this.curve.tokensLeft + tokensIn, realEth: this.curve.realEth - q.grossEthOut };
    this.curveTrade(seller, false, q.grossEthOut, tokensIn, { protocol: q.protocolFee, crew: q.crewFee, creator: q.creatorFee }, block, tx);
    this.snapshot(block);
  }

  /** _graduateMission: 1.5% off the curve's ETH, 200M tokens to the migrator, the pool seeded, a remainder burned. */
  private graduate(block: number, tx: string): void {
    const total = this.curve.realEth;
    const bonus = (total * BigInt(50)) / BPS;
    const liquidity = total - (total * BigInt(100)) / BPS - bonus;
    const reserve = BigInt(200_000_000) * WEI;
    const returned = BigInt(1_000);
    this.curve = { ...this.curve, realEth: BigInt(0) };
    this.graduated = true;
    this.transfer(LAUNCHPAD, MIGRATOR, reserve, block, tx);
    this.transfer(MIGRATOR, POOL_MANAGER, reserve - returned, block, tx);
    this.pool = { eth: liquidity - BigInt(1), tokens: reserve - returned };
    const poolFee = (100 + this.crewBps + this.creatorBps) * 100;
    this.emit(MIGRATOR, MIGRATOR_FEED_EVENTS, "PoolGraduatedAndLocked", { token: this.token, positionTokenId: BigInt(7), ethSeeded: this.pool.eth, tokensSeeded: this.pool.tokens, poolFee }, block, tx);
    this.transfer(MIGRATOR, DEAD, returned, block, tx);
    this.emit(LAUNCHPAD, FEED_EVENTS, "MissionGraduated", { token: this.token, dexPoolOrPosition: MIGRATOR, ethLiquidity: liquidity, tokenLiquidity: reserve, creatorGradBonus: bonus }, block, tx);
  }

  /** A swap on a v4 pool through the router: deltas as the swapper's (a buy pays ETH in, negative). */
  swap(pool: `0x${string}`, wallet: Address, buy: boolean, amount: bigint, block: number, own = true, tx = this.nextTx()): void {
    const k = this.pool.eth * this.pool.tokens;
    if (!buy) this.transfer(wallet, POOL_MANAGER, amount, block, tx);
    const eth = buy ? amount : this.pool.eth - k / (this.pool.tokens + amount);
    const tokens = buy ? this.pool.tokens - k / (this.pool.eth + amount) : amount;
    if (own) this.pool = buy ? { eth: this.pool.eth + eth, tokens: this.pool.tokens - tokens } : { eth: this.pool.eth - eth, tokens: this.pool.tokens + tokens };
    const sqrtPriceX96 = sqrt((this.pool.tokens << BigInt(192)) / this.pool.eth);
    this.emit(POOL_MANAGER, POOL_EVENTS, "Swap", { id: pool, sender: ROUTER, amount0: buy ? -eth : eth, amount1: buy ? tokens : -tokens, sqrtPriceX96, liquidity: BigInt(1), tick: 0, fee: 40_000 }, block, tx);
    if (buy) this.transfer(POOL_MANAGER, wallet, tokens, block, tx);
  }
}

/** ⌊√n⌋ for a bigint. */
export function sqrt(n: bigint): bigint {
  if (n < BigInt(2)) return n;
  let x = BigInt(1) << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> BigInt(1);
    if (y >= x) return x;
    x = y;
  }
}
