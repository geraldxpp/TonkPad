import { type BuyQuote, CURVE_SUPPLY, type CurveSettings, devBuyQuote, graduationTarget, marketCap, percentOf, PROTOCOL_FEE_BPS, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import { effectiveTier, isLocked, lockedAmount, type LockSettings, type LockTier, type LockType } from "@/shared/tonk/rules";
import { type LaunchScore, launchScore } from "@/shared/tonk/score";
import { devBuyWei, effective, type LaunchForm, lockSettings } from "./form";

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
  /** The lock type the launch gets: the creator's, or none without a dev buy. */
  lockType: LockType;
  lock: LockSettings;
  /** The contract accepts this lock (a dev buy, 50%+, 7+ days). */
  locks: boolean;
  /** The Creator Rewards the launch gets: the creator's choice, held to the lock's tier. */
  creator: number;
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
  const held = effective(form, settings);
  const lock = lockSettings({ ...form, lock: held.lock });
  const quote = devBuyQuote(settings, devBuy, held.creator);
  const bought = quote.tokensOut;
  const locks = isLocked(hasBuy, lock);
  const locked = locks ? lockedAmount(bought, lock) : BigInt(0);
  // A lock under 1% of supply unlocks no tier, as the mainnet contract rules.
  const tier = effectiveTier(hasBuy, lock, bought);
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
    lockType: held.lock,
    lock,
    locks,
    creator: held.creator,
    tier,
    creatorMax: held.creatorMax,
    totalBps: PROTOCOL_FEE_BPS + form.crew + held.creator,
    score: launchScore({ bought, lock: locks ? lock : { ...lock, type: "none" }, crewBps: form.crew }),
    crewDaily,
    creatorDaily: (form.volume * held.creator) / 10_000,
    protocolDaily: (form.volume * PROTOCOL_FEE_BPS) / 10_000,
    holderDaily: crewDaily / 100,
  };
}
