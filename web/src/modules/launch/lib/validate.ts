import { type CurveSettings, maxDevBuy } from "@/shared/tonk/curve";
import { LIMITS, normalizeTelegram, normalizeWebsite, normalizeX } from "@/shared/tonk/metadata";
import { MAX_LOCK_DAYS, MIN_LOCK_DAYS } from "@/shared/tonk/rules";
import { devBuyWei, type LaunchForm } from "./form";

/** The fields that can be wrong, in the order the screen shows them. Each names its message in `launch.errors`. */
export const FIELDS = ["name", "ticker", "description", "x", "telegram", "website", "devBuy", "days", "agentName", "agentRole", "agentBrief"] as const;
export type FieldKey = (typeof FIELDS)[number];
export type Issues = Partial<Record<FieldKey, true>>;

/** The step each field sits in, so the phone flow can check one step at a time. */
export const FIELD_STEP: Record<FieldKey, 1 | 2 | 3 | 4> = {
  name: 1,
  ticker: 1,
  description: 1,
  x: 1,
  telegram: 1,
  website: 1,
  devBuy: 1,
  days: 2,
  agentName: 4,
  agentRole: 4,
  agentBrief: 4,
};

const TICKER = /^[A-Z0-9]{1,10}$/;
const within = (text: string, max: number) => text.trim().length >= 1 && text.length <= max;

/** What is wrong with the form: the contract only needs a name and a symbol; the rest keeps the listing clean. */
export function validate(form: LaunchForm, settings: CurveSettings): Issues {
  const issues: Issues = {};
  if (!within(form.name, LIMITS.name)) issues.name = true;
  if (!TICKER.test(form.ticker.trim())) issues.ticker = true;
  if (form.description.length > LIMITS.description) issues.description = true;
  if (normalizeX(form.x) === null) issues.x = true;
  if (normalizeTelegram(form.telegram) === null) issues.telegram = true;
  if (normalizeWebsite(form.website) === null) issues.website = true;
  const buy = devBuyWei(form);
  if (buy === null || buy > maxDevBuy(settings)) issues.devBuy = true;
  if (form.lock === "time" && !(Number.isInteger(form.days) && form.days >= MIN_LOCK_DAYS && form.days <= MAX_LOCK_DAYS)) issues.days = true;
  if (form.agent) {
    if (!within(form.agentName, LIMITS.agentName)) issues.agentName = true;
    if (!within(form.agentRole, LIMITS.agentRole)) issues.agentRole = true;
    if (!within(form.agentBrief, LIMITS.agentBrief)) issues.agentBrief = true;
  }
  return issues;
}

/** The issues in one step (the phone flow), or in all of them. */
export function issuesIn(issues: Issues, step: 1 | 2 | 3 | 4 | "all"): FieldKey[] {
  return FIELDS.filter((key) => issues[key] && (step === "all" || FIELD_STEP[key] === step));
}
