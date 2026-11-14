/**
 * The launchpad's bonding-curve maths, mirrored from TonkpadRobinhood.sol to
 * the wei: every amount is a bigint and every division rounds down, as the
 * contract's does. Nothing here is an estimate.
 */
const ZERO = BigInt(0);
const BPS = BigInt(10_000);
export const WEI = BigInt(10) ** BigInt(18);

/** 1 billion tokens: 800 million sold on the curve, 200 million kept for the graduated pool. */
export const TOTAL_SUPPLY = BigInt(1_000_000_000) * WEI;
export const CURVE_SUPPLY = BigInt(800_000_000) * WEI;
/** The fixed protocol fee on every curve trade, in basis points. */
export const PROTOCOL_FEE_BPS = 100;

/** The launchpad's settings for new launches, read from the contract. */
export interface CurveSettings {
  launchFee: bigint;
  virtualEth: bigint;
  virtualTokens: bigint;
}

/** A curve mid-life: its virtual reserves and the tokens it still has to sell. */
export interface CurveState {
  virtualEth: bigint;
  virtualTokens: bigint;
  tokensLeft: bigint;
}

/** The contract's BuyQuote. */
export interface BuyQuote {
  effectiveEthIn: bigint;
  refundEth: bigint;
  protocolFee: bigint;
  crewFee: bigint;
  creatorFee: bigint;
  netEthIn: bigint;
  tokensOut: bigint;
  newVirtualEth: bigint;
  newVirtualTokens: bigint;
}

/** A fresh curve under the given settings. */
export function freshCurve(settings: CurveSettings): CurveState {
  return { virtualEth: settings.virtualEth, virtualTokens: settings.virtualTokens, tokensLeft: CURVE_SUPPLY };
}

/**
 * _computeBuyQuote: fees come off first, the rest moves the curve, and a buy
 * that would pass graduation is capped there with the excess refunded.
 * `crewBps` is the Crew fee actually charged: 0 while nobody holds the token.
 */
export function buyQuote(curve: CurveState, ethIn: bigint, crewBps: number, creatorBps: number): BuyQuote {
  const totalFeeBps = BigInt(PROTOCOL_FEE_BPS + crewBps + creatorBps);
  const k = curve.virtualEth * curve.virtualTokens;
  const tokensAtGraduation = curve.virtualTokens - curve.tokensLeft;
  const ethAtGraduation = (k + tokensAtGraduation - BigInt(1)) / tokensAtGraduation;
  const maxNet = ethAtGraduation > curve.virtualEth ? ethAtGraduation - curve.virtualEth : ZERO;
  const maxGross = (maxNet * BPS + (BPS - totalFeeBps) - BigInt(1)) / (BPS - totalFeeBps);

  const capped = ethIn >= maxGross && maxGross > ZERO;
  const effectiveEthIn = capped ? maxGross : ethIn;
  const protocolFee = (effectiveEthIn * BigInt(PROTOCOL_FEE_BPS)) / BPS;
  const crewFee = (effectiveEthIn * BigInt(crewBps)) / BPS;
  const creatorFee = (effectiveEthIn * BigInt(creatorBps)) / BPS;
  const netEthIn = effectiveEthIn - protocolFee - crewFee - creatorFee;
  const newVirtualEth = curve.virtualEth + netEthIn;

  let tokensOut = curve.tokensLeft;
  if (!capped) {
    tokensOut = curve.virtualTokens - k / newVirtualEth;
    if (tokensOut > curve.tokensLeft) tokensOut = curve.tokensLeft;
  }
  return {
    effectiveEthIn,
    refundEth: capped ? ethIn - maxGross : ZERO,
    protocolFee,
    crewFee,
    creatorFee,
    netEthIn,
    tokensOut,
    newVirtualEth,
    newVirtualTokens: curve.virtualTokens - tokensOut,
  };
}

/**
 * The creator's buy inside the launch. No Crew fee is charged on it: the
 * whole supply still sits in the launchpad, so nobody is eligible yet.
 */
export function devBuyQuote(settings: CurveSettings, devBuy: bigint, creatorBps: number): BuyQuote {
  if (devBuy <= ZERO) {
    return { effectiveEthIn: ZERO, refundEth: ZERO, protocolFee: ZERO, crewFee: ZERO, creatorFee: ZERO, netEthIn: ZERO, tokensOut: ZERO, newVirtualEth: settings.virtualEth, newVirtualTokens: settings.virtualTokens };
  }
  return buyQuote(freshCurve(settings), devBuy, 0, creatorBps);
}

/** A token's curve as its mission stores it: the reserves, the tokens left, and the ETH really held for sells. */
export interface MissionCurve extends CurveState {
  realEth: bigint;
}

/** What the contract's sell() pays for tokens. */
export interface SellQuote {
  grossEthOut: bigint;
  protocolFee: bigint;
  crewFee: bigint;
  creatorFee: bigint;
  netEthOut: bigint;
  newVirtualEth: bigint;
  newVirtualTokens: bigint;
  /** The payout was limited to the ETH really in the curve. */
  capped: boolean;
}

/**
 * sell(): the tokens move the curve, the ETH paid out is at most what the
 * curve really holds, and the fees come off that. `crewBps` is the Crew fee
 * actually charged: 0 while nobody eligible holds the token.
 */
export function sellQuote(curve: MissionCurve, tokensIn: bigint, crewBps: number, creatorBps: number): SellQuote {
  const k = curve.virtualEth * curve.virtualTokens;
  const newVirtualTokens = curve.virtualTokens + tokensIn;
  const uncapped = curve.virtualEth - k / newVirtualTokens;
  const capped = uncapped > curve.realEth;
  const grossEthOut = capped ? curve.realEth : uncapped;
  const protocolFee = (grossEthOut * BigInt(PROTOCOL_FEE_BPS)) / BPS;
  const crewFee = (grossEthOut * BigInt(crewBps)) / BPS;
  const creatorFee = (grossEthOut * BigInt(creatorBps)) / BPS;
  return {
    grossEthOut,
    protocolFee,
    crewFee,
    creatorFee,
    netEthOut: grossEthOut - protocolFee - crewFee - creatorFee,
    newVirtualEth: curve.virtualEth - grossEthOut,
    newVirtualTokens,
    capped,
  };
}

/** The least the contract must deliver for a quote at this slippage. Never zero: a zero minimum protects nobody. */
export function minimumOut(quote: bigint, slippageBps: number): bigint {
  const minimum = (quote * BigInt(10_000 - slippageBps)) / BPS;
  return minimum > ZERO ? minimum : BigInt(1);
}

/** How much of the 800 million curve tokens have been sold, 0 to 1. */
export function curveFilled(tokensLeft: bigint): number {
  return Number(((CURVE_SUPPLY - tokensLeft) * BigInt(1_000_000)) / CURVE_SUPPLY) / 1_000_000;
}

/** The price of one token in ETH, from the reserves (the contract's telemetry rounds it down to a whole wei). */
export function tokenPrice(virtualEth: bigint, virtualTokens: bigint): number {
  return Number((virtualEth * BigInt(10) ** BigInt(30)) / virtualTokens) / 1e30;
}

/** Market cap in wei for a curve's reserves: its price times the whole supply. */
export function marketCap(virtualEth: bigint, virtualTokens: bigint): bigint {
  return (virtualEth * TOTAL_SUPPLY) / virtualTokens;
}

/** The net ETH a fresh curve must take in to sell all 800 million tokens and graduate. */
export function graduationTarget(settings: CurveSettings): bigint {
  const tokensAtGraduation = settings.virtualTokens - CURVE_SUPPLY;
  return (settings.virtualEth * settings.virtualTokens + tokensAtGraduation - BigInt(1)) / tokensAtGraduation - settings.virtualEth;
}

/** Round amounts: 1, 1.5, 2, 2.5, 3, 4, 5, 6 and 8 times a power of ten, in tenths of that power. */
const ROUND_STEPS = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100].map((step) => BigInt(step));

/**
 * A round amount near `wei`: 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of
 * ten. "nearest" picks the closer by ratio (never more than about 22% away),
 * "down" the one at or below, "up" the one at or above. 0.0416… ETH becomes
 * 0.04 (nearest or down), and 0.25 stays 0.25 in every mode.
 */
export function roundAmount(wei: bigint, mode: "nearest" | "down" | "up" = "nearest"): bigint {
  if (wei < BigInt(10)) return wei;
  let unit = BigInt(1);
  while (wei >= unit * BigInt(100)) unit *= BigInt(10);
  for (let index = 1; index < ROUND_STEPS.length; index += 1) {
    const low = ROUND_STEPS[index - 1] * unit;
    const high = ROUND_STEPS[index] * unit;
    if (wei === low) return low;
    if (wei < high) return mode === "down" ? low : mode === "up" ? high : wei * wei <= low * high ? low : high;
  }
  return wei;
}

/**
 * The three buy presets for a curve's virtual ETH reserve: the reserve ÷ 60,
 * ÷ 24 and ÷ 12, each turned into a round amount so it reads cleanly: 0.1,
 * 0.25 and 0.5 ETH at a 6 ETH reserve, and 0.02, 0.04 and 0.08 ETH at 1 ETH.
 * The smallest rounds up, so it still buys at least its share and a lock of it
 * reaches the same 10M-token floors as before; the middle one, the form's
 * default, rounds down, so it never buys more than about 4.2% of supply and
 * stays clear of the score's 5% unlocked-buy line.
 */
export function reservePresets(virtualEth: bigint): [bigint, bigint, bigint] {
  return [roundAmount(virtualEth / BigInt(60), "up"), roundAmount(virtualEth / BigInt(24), "down"), roundAmount(virtualEth / BigInt(12))];
}

/** The three dev-buy presets, from the launchpad's virtual reserve. */
export function devBuyPresets(settings: CurveSettings): [bigint, bigint, bigint] {
  return reservePresets(settings.virtualEth);
}

/** The largest dev buy the screen accepts: 1⅔ times the virtual reserve (10 ETH at 6 ETH), about two thirds of supply. */
export function maxDevBuy(settings: CurveSettings): bigint {
  return (settings.virtualEth * BigInt(5)) / BigInt(3);
}

/** `part` as a percentage of `whole`, e.g. 4.2095 for 4.2095%. Safe for token-sized numbers. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole <= ZERO) return 0;
  return Number((part * BigInt(100_000_000)) / whole) / 1_000_000;
}
