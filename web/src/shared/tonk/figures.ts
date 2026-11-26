import { fmt } from "@/shared/i18n/config";
import { en } from "@/shared/i18n/dictionaries/en";
import { formatUsd, formatUsdCompact } from "@/shared/lib/format";
import { CURVE_SUPPLY, graduationTarget, marketCap } from "./curve";
import { formatEth, formatEthShort, formatTokensFull } from "./format";
import { curveSettings, type TonkSettingsJson } from "./types";

const ZERO = BigInt(0);

/**
 * The launchpad's figures for a new launch, worked out from its live
 * settings with the curve maths the Creator Studio uses (shared/tonk/curve).
 * Every amount is in wei; nothing is an estimate of the contract's own.
 * The Docs page shows them, and the Telegram bot's launchpad_figures tool
 * reads the same ones (prompts/15-community-agent.md).
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

/**
 * The figures as the Docs page writes them in English (its figure-text and
 * its messages): "0.005 ETH", "1 ETH and 1,073,000,000 tokens, virtual",
 * "After about 2.93 ETH net into the curve", "≈ $15.00".
 */
export interface FigureStrings {
  launchFee: string;
  startReserves: string;
  startCap: string;
  graduation: string;
  graduationCap: string;
  paused: boolean;
  /** The dollar values at this ETH price, or null without a usable one. */
  usd: { launchFee: string; startCap: string; graduationCap: string } | null;
}

/**
 * The Docs page's strings for these figures, with its own formatters, in
 * `unit` ("ETH", or "test ETH" on the testnet site). English, like the bot's
 * knowledge pack: the bot answers in the asker's language from English facts.
 */
export function figureStrings(f: DocsFigures, ethUsd: number | null, unit: string): FigureStrings {
  const m = en.docs.figures;
  const exact = (wei: bigint) => `${formatEth(wei)} ${unit}`;
  const about = (wei: bigint) => `${formatEthShort(wei)} ${unit}`;
  const dollars = (wei: bigint, compact: boolean) => {
    const value = usdValue(wei, ethUsd);
    return value === null ? null : fmt(m.usd, { usd: compact ? formatUsdCompact(value) : formatUsd(value) });
  };
  const fee = dollars(f.launchFee, false);
  const startCap = dollars(f.startCap, true);
  const graduationCap = dollars(f.graduationCap, true);
  return {
    launchFee: exact(f.launchFee),
    startReserves: fmt(m.reservesValue, { eth: exact(f.virtualEth), tokens: formatTokensFull(f.virtualTokens) }),
    startCap: about(f.startCap),
    graduation: fmt(m.graduationValue, { eth: about(f.target) }),
    graduationCap: fmt(m.graduationCap, { cap: about(f.graduationCap) }),
    paused: f.paused,
    usd: fee !== null && startCap !== null && graduationCap !== null ? { launchFee: fee, startCap, graduationCap } : null,
  };
}
