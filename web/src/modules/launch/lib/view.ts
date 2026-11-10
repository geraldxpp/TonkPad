import { type BuyQuote, CURVE_SUPPLY, type CurveSettings, devBuyQuote, graduationTarget, marketCap, percentOf, PROTOCOL_FEE_BPS, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { isLocked, lockedAmount, type LockSettings, type LockTier, lockTier, TIER_CREATOR_MAX } from "@/shared/tonk/rules";
import { type LaunchScore, launchScore } from "@/shared/tonk/score";
import { devBuyWei, type LaunchForm, lockSettings } from "./form";

/** Every figure the Creator Studio shows, worked out from the form and the launchpad's settings. */
export interface LaunchView {
  /** The dev buy in wei (0 while the typed amount isn't valid). */
  devBuy: bigint;
  hasBuy: boolean;
  quote: BuyQuote;
  bought: bigint;
  locked: bigint;
  liquid: bigint;
  /** The dev buy as a percentage of total supply, and of the 800M on the curve. */
  supplyPct: number;
  curvePct: number;
  /** Launch fee plus dev buy: the transaction's value. */
  payNow: bigint;
  startCap: bigint;
  afterCap: bigint;
  /** Net ETH the curve needs to graduate. */
  target: bigint;
  lock: LockSettings;
  /** The contract accepts this lock (a dev buy, 50%+, 7+ days). */
  locks: boolean;
  tier: LockTier;
  creatorMax: number;
  totalBps: number;
  score: LaunchScore;
  /** The illustrative day: dollars to the Crew, to the creator and to tonkfun.fun (the protocol fee, before any referrer's quarter). */
  crewDaily: number;
  creatorDaily: number;
  protocolDaily: number;
  /** Of the Crew's dollars, what a holder of 1% of the eligible supply earns. */
  holderDaily: number;
}

export function launchView(form: LaunchForm, settings: CurveSettings): LaunchView {
  const devBuy = devBuyWei(form) ?? BigInt(0);
  const hasBuy = devBuy > BigInt(0);
  const lock = lockSettings(form);
  const quote = devBuyQuote(settings, devBuy, form.creator);
  const bought = quote.tokensOut;
  const locks = isLocked(hasBuy, lock);
  const locked = locks ? lockedAmount(bought, lock) : BigInt(0);
  const tier = lockTier(hasBuy, lock);
  const crewDaily = (form.volume * form.crew) / 10_000;
  return {
    devBuy,
    hasBuy,
    quote,
    bought,
    locked,
    liquid: bought - locked,
    supplyPct: percentOf(bought, TOTAL_SUPPLY),
    curvePct: percentOf(bought, CURVE_SUPPLY),
    payNow: settings.launchFee + devBuy,
    startCap: marketCap(settings.virtualEth, settings.virtualTokens),
    afterCap: marketCap(quote.newVirtualEth, quote.newVirtualTokens),
    target: graduationTarget(settings),
    lock,
    locks,
    tier,
    creatorMax: TIER_CREATOR_MAX[tier],
    totalBps: PROTOCOL_FEE_BPS + form.crew + form.creator,
    score: launchScore({ bought, lock: locks ? lock : { ...lock, type: "none" }, crewBps: form.crew }),
    crewDaily,
    creatorDaily: (form.volume * form.creator) / 10_000,
    protocolDaily: (form.volume * PROTOCOL_FEE_BPS) / 10_000,
    holderDaily: crewDaily / 100,
  };
}
