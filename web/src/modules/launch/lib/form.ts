import { type CurveSettings, devBuyPresets, devBuyQuote, maxDevBuy } from "@/shared/tonk/curve";
import { ethInputText, parseEthInput } from "@/shared/tonk/format";
import { AGENT_VOICES, type AgentVoice } from "@/shared/tonk/metadata";
import { CREATOR_OPTIONS, CREW_OPTIONS, effectiveTier, type LockSettings, type LockType, MAX_LOCK_DAYS, MIN_LOCK_DAYS, optionAtMost, REWARD_POOL_BPS, TIER_CREATOR_MAX } from "@/shared/tonk/rules";

/** Everything the Creator Studio collects. Amounts are kept as typed; fees are basis points. */
export interface LaunchForm {
  name: string;
  ticker: string;
  description: string;
  x: string;
  telegram: string;
  website: string;
  /** The uploaded image's address (one of ours), or "" for the letter. */
  image: string;
  /** The initial dev buy in ETH, as typed ("" or "0" is none). */
  devBuy: string;
  lock: LockType;
  /** Share of the dev buy to lock, 50–100 in steps of 5. */
  share: number;
  /** Linear vesting: 1–12 months of 30 days. */
  months: number;
  /** Time-lock: 7–365 days. */
  days: number;
  crew: number;
  creator: number;
  agent: boolean;
  agentName: string;
  agentRole: string;
  agentBrief: string;
  voice: AgentVoice;
  /** The example daily volume, in dollars. */
  volume: number;
}

export const VOLUMES = [25_000, 100_000, 500_000] as const;
export const TIME_LOCK_PRESETS = [30, 90, 180] as const;

/** Why the form changed a setting on its own, for the notice under the fees. */
export type Notice =
  | { key: "devBuyMax"; amount: bigint }
  | { key: "noBuy" }
  | { key: "creatorTier" | "creatorPool" | "crewPool"; bps: number };

/** The form as a new creator finds it: text empty, the settings the design opens with. */
export function defaultForm(settings: CurveSettings): LaunchForm {
  return {
    name: "",
    ticker: "",
    description: "",
    x: "",
    telegram: "",
    website: "",
    image: "",
    devBuy: ethInputText(devBuyPresets(settings)[1]),
    lock: "linear",
    share: 80,
    months: 6,
    days: 180,
    crew: 200,
    creator: 100,
    agent: false,
    agentName: "",
    agentRole: "",
    agentBrief: "",
    voice: "tactical",
    volume: 100_000,
  };
}

/** The dev buy in wei: 0 for none, null while the text isn't an amount. */
export function devBuyWei(form: LaunchForm): bigint | null {
  return parseEthInput(form.devBuy);
}

/** The lock as the contract will see it. */
export function lockSettings(form: LaunchForm): LockSettings {
  return { type: form.lock, sharePct: form.share, days: form.lock === "linear" ? form.months * 30 : form.lock === "time" ? form.days : 0 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** A custom time-lock's days brought into the range the screen offers: 7–365. */
export function settleDays(days: number): number {
  return Math.round(clamp(days, MIN_LOCK_DAYS, MAX_LOCK_DAYS));
}

/**
 * What the launch really gets from the creator's choices, which the form keeps
 * exactly as chosen: no lock without a dev buy, and Creator Rewards held to
 * what the lock's tier allows and to what Crew leaves of the shared 4%. It is
 * worked out afresh from the form every time, so a value passed on the way to
 * another (a dev buy or a custom length typed digit by digit, a slider
 * crossing a tier, Crew raised for a moment) never undoes a choice, and the
 * notices say what is held back, and why, for as long as it is.
 */
export function effective(form: LaunchForm, settings: CurveSettings): { lock: LockType; creator: number; creatorMax: number; notices: Notice[] } {
  const devBuy = devBuyWei(form) ?? BigInt(0);
  const hasBuy = devBuy > BigInt(0);
  const lock = hasBuy ? form.lock : "none";
  const locking = lockSettings({ ...form, lock });
  // The most Creator Rewards this lock allows. Each option is judged by the tokens its own fee buys, as the contract
  // checks a tier's 1%-of-supply lock after the buy; a higher fee buys fewer tokens, so the allowed options run up to one cap.
  let creatorMax = 0;
  for (const bps of CREATOR_OPTIONS) {
    if (bps <= TIER_CREATOR_MAX[effectiveTier(hasBuy, locking, devBuyQuote(settings, devBuy, bps).tokensOut)]) creatorMax = bps;
  }
  const poolMax = REWARD_POOL_BPS - form.crew;
  const creator = optionAtMost(CREATOR_OPTIONS, Math.min(form.creator, creatorMax, poolMax));
  const notices: Notice[] = [];
  if (lock !== form.lock) notices.push({ key: "noBuy" });
  if (creator < form.creator) notices.push({ key: creatorMax <= poolMax ? "creatorTier" : "creatorPool", bps: creator });
  return { lock, creator, creatorMax, notices };
}

/**
 * Brings the form back inside the launchpad's rules after a change, and says
 * what it had to adjust: the dev buy stays under its cap, and a Creator
 * Rewards choice that doesn't fit the shared 4% lowers Crew. The lock and
 * Creator Rewards stay as chosen; `effective` says what the launch gets from
 * them (raising Crew holds Creator back there, rather than changing it).
 */
export function normalize(input: LaunchForm, settings: CurveSettings, changed: keyof LaunchForm | null = null): { form: LaunchForm; notices: Notice[] } {
  const form = { ...input };
  const notices: Notice[] = [];

  const buy = devBuyWei(form);
  const cap = maxDevBuy(settings);
  if (buy !== null && buy > cap) {
    form.devBuy = ethInputText(cap);
    notices.push({ key: "devBuyMax", amount: cap });
  }
  form.lock = form.lock === "time" || form.lock === "linear" ? form.lock : "none";
  form.share = Math.round(clamp(form.share, 50, 100) / 5) * 5;
  form.months = Math.round(clamp(form.months, 1, 12));
  // Left as typed (validation flags it) so a number can be entered digit by digit; the field settles it on blur.
  form.days = Math.round(clamp(form.days, 0, 9_999));
  form.crew = optionAtMost(CREW_OPTIONS, clamp(form.crew, 0, REWARD_POOL_BPS));
  form.creator = optionAtMost(CREATOR_OPTIONS, clamp(form.creator, 0, REWARD_POOL_BPS));
  form.voice = AGENT_VOICES.includes(form.voice) ? form.voice : "tactical";
  form.volume = VOLUMES.includes(form.volume as (typeof VOLUMES)[number]) ? form.volume : 100_000;

  if (changed === "creator" && form.crew + form.creator > REWARD_POOL_BPS) {
    form.crew = optionAtMost(CREW_OPTIONS, REWARD_POOL_BPS - form.creator);
    notices.push({ key: "crewPool", bps: form.crew });
  }
  return { form, notices };
}
