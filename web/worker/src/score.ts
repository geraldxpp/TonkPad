import type { ScoreLevel } from "@/shared/types/token";
import type { TrackedToken } from "./model";

/**
 * Mission score v1 (0–100), from the facts the worker has today. It is a
 * placeholder until the product rules are set; it errs towards caution.
 *
 * Starts at 50, then:
 * - mint / freeze authority given up: +8 / +7; still held: −25 each
 * - graduated (liquidity locked in the AMM): +10
 * - creator bought over 15% at launch: −20 (over 5%: −8)
 * - at least 30 trades in the last hour with a healthy buy/sell mix: +8
 * - fell 60% or more in the last hour: −15
 * - $50K+ volume in 24h: +7
 * - under 10 minutes old (too early to tell): −10
 */
export function missionScore(token: TrackedToken, now: number): { score: number; level: ScoreLevel } {
  let score = 50;
  if (token.mintRevoked === true) score += 8;
  else if (token.mintRevoked === false) score -= 25;
  if (token.freezeRevoked === true) score += 7;
  else if (token.freezeRevoked === false) score -= 25;
  if (token.graduated) score += 10;
  if (token.creatorBuyShare > 0.15) score -= 20;
  else if (token.creatorBuyShare > 0.05) score -= 8;

  const h1 = token.windows.h1;
  const trades = h1.buys + h1.sells;
  const mix = h1.buys / Math.max(1, h1.sells);
  if (trades >= 30 && mix >= 0.8 && mix <= 4) score += 8;
  if (h1.change <= -60) score -= 15;
  if (token.windows.h24.volume >= 50_000) score += 7;
  if (now - token.createdAt < 10 * 60_000) score -= 10;

  const clamped = Math.round(Math.min(99, Math.max(1, score)));
  const level: ScoreLevel = clamped >= 75 ? "Safe" : clamped >= 50 ? "Caution" : "Risky";
  return { score: clamped, level };
}
