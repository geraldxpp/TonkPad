import type { ScoreLevel } from "@/shared/types/token";
import { creatorLock, poolLockedOrBurned } from "./locks";
import type { TrackedToken } from "./model";

/**
 * Mission score v2 (0–100), approved by the owner on 7 Nov 2026; it errs
 * towards caution. Starts at 50, then:
 * - mint / freeze authority given up: +8 / +7; still held: −25 each
 * - a verified tokenized stock or RWA (issuers.ts) holds both by design: +15
 *   instead, and the creator-buy, top-holder and pool-depth checks skip it
 * - pool liquidity burned or locked at graduation (Pump.fun, Pons): +10
 * - creator bought over 15% at launch: −20 (over 5%: −8), waived when the
 *   creator has locked half that buy for 30+ days (locks.ts)
 * - half or more of the creator's tokens locked for 30+ days: +10
 * - Crew Rewards of 1% or more on every curve trade (tonkfun.fun launches;
 *   the owner's call, 10 Nov 2026): +5
 * - valued at $20K+, the 10 largest wallets hold over 50%: −20 (30–50%: −10,
 *   under 20%: +5)
 * - at least 30 trades in the last hour with a healthy buy/sell mix: +8
 * - fell 60% or more in the last hour: −15
 * - $50K+ volume in 24h: +7
 * - under 10 minutes old (too early to tell): −10
 * - valued at $20K+ with a pool holding under 5% of the market cap: −20
 *   (never Safe); under 2%: capped at 30 (Risky). A pool that small can't
 *   back the price, so a few wallets hold nearly all of the supply.
 */
const THIN_LIQUIDITY = 0.05;
const CRITICAL_LIQUIDITY = 0.02;
/** Below this market cap, pool and holder data are too noisy to judge. */
export const JUDGED_FROM = 20_000;

/** Pool liquidity as a share of market cap, or null when unknown or the token is too small to judge. */
export function liquidityShare(token: TrackedToken): number | null {
  const liquidity = token.liquidityUsd ?? null;
  if (liquidity === null || token.marketCap < JUDGED_FROM) return null;
  return liquidity / token.marketCap;
}

/** Points for the top-10 wallets' share of supply; 0 while unmeasured or too small to judge. */
export function holderPoints(token: TrackedToken): number {
  const share = token.top10Share ?? null;
  if (share === null || token.marketCap < JUDGED_FROM) return 0;
  if (share > 0.5) return -20;
  if (share >= 0.3) return -10;
  return share < 0.2 ? 5 : 0;
}

/** Authorities, the creator's buy and locks, and the holder spread: everything a verified issuer is exempt from. */
function launchPoints(token: TrackedToken, now: number): number {
  if (token.issuer) return 15;
  let points = 0;
  if (token.mintRevoked === true) points += 8;
  else if (token.mintRevoked === false) points -= 25;
  if (token.freezeRevoked === true) points += 7;
  else if (token.freezeRevoked === false) points -= 25;
  const lock = creatorLock(token, now);
  if (lock.ofLaunchBuy < 0.5) {
    if (token.creatorBuyShare > 0.15) points -= 20;
    else if (token.creatorBuyShare > 0.05) points -= 8;
  }
  if (lock.ofHoldings >= 0.5) points += 10;
  return points + holderPoints(token);
}

export function missionScore(token: TrackedToken, now: number): { score: number; level: ScoreLevel } {
  let score = 50 + launchPoints(token, now);
  if (poolLockedOrBurned(token)) score += 10;
  if ((token.crewBps ?? 0) >= 100) score += 5;

  const h1 = token.windows.h1;
  const trades = h1.buys + h1.sells;
  const mix = h1.buys / Math.max(1, h1.sells);
  if (trades >= 30 && mix >= 0.8 && mix <= 4) score += 8;
  if (h1.change <= -60) score -= 15;
  if (token.windows.h24.volume >= 50_000) score += 7;
  if (now - token.createdAt < 10 * 60_000) score -= 10;

  const depth = token.issuer ? null : liquidityShare(token);
  if (depth !== null && depth < THIN_LIQUIDITY && depth >= CRITICAL_LIQUIDITY) score -= 20;

  let clamped = Math.round(Math.min(99, Math.max(1, score)));
  if (depth !== null && depth < CRITICAL_LIQUIDITY) clamped = Math.min(clamped, 30);
  const level: ScoreLevel = clamped >= 75 ? "Safe" : clamped >= 50 ? "Caution" : "Risky";
  return { score: clamped, level };
}
