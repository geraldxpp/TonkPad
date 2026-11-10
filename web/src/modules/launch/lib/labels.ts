import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { bpsText } from "@/shared/tonk/format";
import type { LaunchForm } from "./form";

type Launch = Dictionary["launch"];

/** The lock in a few words: "80% · 6-month linear vest", "50% · 90-day time-lock" or "No lock". */
export function lockLabel(l: Launch, form: LaunchForm, locks: boolean): string {
  if (!locks) return l.steps.lockNone;
  return form.lock === "time" ? fmt(l.steps.lockTime, { share: form.share, days: form.days }) : fmt(l.steps.lockLinear, { share: form.share, months: form.months });
}

/** A fee as the screen says it: "2.0%", or "Off" at zero. */
export function feeLabel(l: Launch, bps: number): string {
  return bps === 0 ? l.economics.off : bpsText(bps);
}

/** The agent in a few words: its name, or "Off". */
export function agentLabel(l: Launch, form: LaunchForm): string {
  return form.agent ? form.agentName.trim() || l.steps.agent : l.steps.agentOff;
}
