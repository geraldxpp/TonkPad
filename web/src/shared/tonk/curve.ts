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

/** Market cap in wei for a curve's reserves: its price times the whole supply. */
export function marketCap(virtualEth: bigint, virtualTokens: bigint): bigint {
  return (virtualEth * TOTAL_SUPPLY) / virtualTokens;
}

/** The net ETH a fresh curve must take in to sell all 800 million tokens and graduate. */
export function graduationTarget(settings: CurveSettings): bigint {
  const tokensAtGraduation = settings.virtualTokens - CURVE_SUPPLY;
  return (settings.virtualEth * settings.virtualTokens + tokensAtGraduation - BigInt(1)) / tokensAtGraduation - settings.virtualEth;
}

/**
 * The three dev-buy presets: the virtual reserve ÷ 60, ÷ 24 and ÷ 12. They
 * buy the same share of supply on any network, and come out as exactly
 * 0.1, 0.25 and 0.5 ETH at the 6 ETH mainnet reserve.
 */
export function devBuyPresets(settings: CurveSettings): [bigint, bigint, bigint] {
  return [settings.virtualEth / BigInt(60), settings.virtualEth / BigInt(24), settings.virtualEth / BigInt(12)];
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
