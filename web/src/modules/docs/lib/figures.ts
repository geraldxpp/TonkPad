import { CURVE_SUPPLY, graduationTarget, marketCap } from "@/shared/tonk/curve";
import { curveSettings, type TonkSettingsJson } from "@/shared/tonk/types";

const ZERO = BigInt(0);

/**
 * The launchpad's figures for a new launch, worked out from its live
 * settings with the curve maths the Creator Studio uses (shared/tonk/curve).
 * Every amount is in wei; nothing is an estimate of the contract's own.
 */
export interface DocsFigures {
  launchFee: bigint;
  virtualEth: bigint;
  virtualTokens: bigint;
  /** The market cap at the starting reserves: the price times the whole billion. */
  startCap: bigint;
  /** The net ETH a new curve takes in to sell all 800 million tokens: also the most ETH it ever holds. */
  target: bigint;
  /** The market cap on the curve the moment it sells out. */
  graduationCap: bigint;
  /** The owner has paused launches and curve buys. */
  paused: boolean;
}

const WEI_TEXT = /^\d{1,78}$/;

/**
 * The figures for these settings, or null where no curve could run on them
 * (a malformed answer, no ETH reserve, or a token reserve that doesn't cover
 * the 800 million sold on the curve), so the page never shows a made-up number.
 */
export function docsFigures(json: TonkSettingsJson): DocsFigures | null {
  if (![json.launchFee, json.virtualEth, json.virtualTokens].every((value) => WEI_TEXT.test(value))) return null;
  const settings = curveSettings(json);
  if (settings.virtualEth <= ZERO || settings.virtualTokens <= CURVE_SUPPLY) return null;
  const target = graduationTarget(settings);
  return {
    launchFee: settings.launchFee,
    virtualEth: settings.virtualEth,
    virtualTokens: settings.virtualTokens,
    startCap: marketCap(settings.virtualEth, settings.virtualTokens),
    target,
    graduationCap: marketCap(settings.virtualEth + target, settings.virtualTokens - CURVE_SUPPLY),
    paused: json.paused,
  };
}

/** An ETH amount in dollars at this price, or null without a usable price. */
export function usdValue(wei: bigint, ethUsd: number | null): number | null {
  if (ethUsd === null || !Number.isFinite(ethUsd) || ethUsd <= 0) return null;
  return (Number(wei) / 1e18) * ethUsd;
}
