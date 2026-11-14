import { type BuyQuote, CURVE_SUPPLY, type CurveSettings, devBuyQuote, graduationTarget, marketCap, minDevBuyFor, percentOf, PROTOCOL_FEE_BPS, roundAmount, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import {
  CREATOR_OPTIONS,
  effectiveTier,
  isLocked,
  lockedAmount,
  type LockSettings,
  type LockTier,
  lockTier,
  type LockType,
  MIN_LOCKED_FOR_TIER,
  optionAtMost,
  REWARD_POOL_BPS,
  TIER_CREATOR_MAX,
} from "@/shared/tonk/rules";
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
  /**
   * A lock whose share and length reach a tier but which holds under the 10M
   * tokens (1% of supply) a tier also needs: the dev buy, rounded up, that
   * would open it, and the Creator Rewards that would allow. Null otherwise.
   */
  floor: { amount: bigint; pct: number } | null;
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
  // Long and large enough by share, but too small in tokens: say what dev buy opens the tier, at the most it allows here.
  const reach = lockTier(hasBuy, lock);
  const pct = optionAtMost(CREATOR_OPTIONS, Math.min(TIER_CREATOR_MAX[reach], REWARD_POOL_BPS - form.crew));
  const shareBps = BigInt(lock.sharePct * 100);
  const needed = reach !== "none" && tier === "none" && pct > TIER_CREATOR_MAX.none && shareBps > BigInt(0) ? minDevBuyFor(settings, (MIN_LOCKED_FOR_TIER * BigInt(10_000) + shareBps - BigInt(1)) / shareBps, pct) : null;
  const floor = needed === null ? null : { amount: roundAmount(needed, "up"), pct };
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
    floor,
    totalBps: PROTOCOL_FEE_BPS + form.crew + held.creator,
    score: launchScore({ bought, lock: locks ? lock : { ...lock, type: "none" }, crewBps: form.crew }),
    crewDaily,
    creatorDaily: (form.volume * held.creator) / 10_000,
    protocolDaily: (form.volume * PROTOCOL_FEE_BPS) / 10_000,
    holderDaily: crewDaily / 100,
  };
}
