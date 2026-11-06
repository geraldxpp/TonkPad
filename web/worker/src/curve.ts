/**
 * Bonding-curve progress for Pump.fun-style curves (Pump.fun, and Bonk.fun's
 * LaunchLab, which uses the same shape): a constant-product curve that starts
 * with 30 SOL and 1.073B tokens of virtual reserves and graduates once 85 SOL
 * has been raised (793.1M tokens sold).
 *
 * The feeds give a price, so the curve position is recovered from it:
 * price = vSol / vTokens and vSol × vTokens = k, so vSol = √(price × k).
 */
const INITIAL_VIRTUAL_SOL = 30;
const INITIAL_VIRTUAL_TOKENS = 1_073_000_000;
const RAISE_TARGET_SOL = 85;
const K = INITIAL_VIRTUAL_SOL * INITIAL_VIRTUAL_TOKENS;

/** Progress 0–1 from the token's price in SOL per token. */
export function curveProgressFromPrice(priceSol: number): number {
  if (!Number.isFinite(priceSol) || priceSol <= 0) return 0;
  const virtualSol = Math.sqrt(priceSol * K);
  return clamp01((virtualSol - INITIAL_VIRTUAL_SOL) / RAISE_TARGET_SOL);
}

/** Progress 0–1 from the virtual SOL reserve a launch event reports. */
export function curveProgressFromReserve(virtualSol: number): number {
  return clamp01((virtualSol - INITIAL_VIRTUAL_SOL) / RAISE_TARGET_SOL);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
