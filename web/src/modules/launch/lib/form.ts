import { type CurveSettings, devBuyPresets, maxDevBuy } from "@/shared/tonk/curve";
import { ethInputText, parseEthInput } from "@/shared/tonk/format";
import { AGENT_VOICES, type AgentVoice } from "@/shared/tonk/metadata";
import { CREATOR_OPTIONS, CREW_OPTIONS, type LockSettings, lockTier, type LockType, MAX_LOCK_DAYS, MIN_LOCK_DAYS, optionAtMost, REWARD_POOL_BPS, TIER_CREATOR_MAX } from "@/shared/tonk/rules";

/** Everything the Creator Studio collects. Amounts are kept as typed; fees are basis points. */
export interface LaunchForm {
  name: string;
  ticker: string;
  description: string;
  x: string;
  telegram: string;
  website: string;
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
 * Brings the form back inside the launchpad's rules after a change, and says
 * what it had to adjust: the dev buy stays under its cap; no dev buy means no
 * lock; Creator Rewards stay within the lock's tier; and Crew plus Creator
 * stay within the shared 4%, the one just changed keeping its value.
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

  const hasBuy = (devBuyWei(form) ?? BigInt(0)) > BigInt(0);
  if (!hasBuy && form.lock !== "none") {
    form.lock = "none";
    notices.push({ key: "noBuy" });
  }
  const creatorMax = TIER_CREATOR_MAX[lockTier(hasBuy, lockSettings(form))];
  if (form.creator > creatorMax) {
    form.creator = optionAtMost(CREATOR_OPTIONS, creatorMax);
    notices.push({ key: "creatorTier", bps: form.creator });
  }
  if (form.crew + form.creator > REWARD_POOL_BPS) {
    if (changed === "creator") {
      form.crew = optionAtMost(CREW_OPTIONS, REWARD_POOL_BPS - form.creator);
      notices.push({ key: "crewPool", bps: form.crew });
    } else {
      form.creator = optionAtMost(CREATOR_OPTIONS, Math.min(creatorMax, REWARD_POOL_BPS - form.crew));
      notices.push({ key: "creatorPool", bps: form.creator });
    }
  }
  return { form, notices };
}
