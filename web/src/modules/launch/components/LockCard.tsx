"use client";

import { Hourglass, Lock, LockOpen, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { bpsText, formatTokens } from "@/shared/tonk/format";
import { type LockType, MAX_LOCK_DAYS, MIN_LOCK_DAYS } from "@/shared/tonk/rules";
import { settleDays, TIME_LOCK_PRESETS } from "../lib/form";
import type { StudioProps } from "./types";
import { HELP, Option, StepCard } from "./ui";
import { VestingChart } from "./VestingChart";

const RANGE = "h-5 w-full cursor-pointer accent-pos";
const SCALE = "mt-2 flex justify-between gap-2 font-mono text-[10px] text-text-3";

/** Card 2: how the creator's launch buy is locked, how much of it and for how long, and what that commitment earns. */
export function LockCard({ state, view, hiddenOnPhone }: StudioProps & { hiddenOnPhone: boolean }) {
  const { t } = useI18n();
  const k = t.launch.lock;
  const { form, set } = state;
  const ticker = form.ticker.trim();
  const days = view.lock.days;
  const modes: { id: LockType; icon: ReactNode; title: string; sub: string }[] = [
    { id: "time", icon: <Hourglass size={18} strokeWidth={1.8} />, title: k.time, sub: k.timeSub },
    { id: "linear", icon: <TrendingDown size={18} strokeWidth={1.8} />, title: k.linear, sub: k.linearSub },
    { id: "none", icon: <LockOpen size={18} strokeWidth={1.8} />, title: k.none, sub: k.noneSub },
  ];
  const tierName = { none: k.tierNone, standard: k.tierStandard, ironclad: k.tierIronclad }[view.tier];
  const message = { none: k.messageNone, standard: k.messageStandard, ironclad: k.messageIronclad }[view.tier];
  return (
    <StepCard
      id="step-2"
      number="02"
      tone="crew"
      title={k.title}
      subtitle={k.subtitle}
      hiddenOnPhone={hiddenOnPhone}
      aside={<span className="flex-none rounded border border-line px-1.5 py-1 font-mono text-[10px] whitespace-nowrap text-text-3 max-sm:hidden">{k.tag}</span>}
    >
      <div role="group" aria-label={k.mode} className="grid grid-cols-3 gap-2.5 max-sm:gap-1.5">
        {modes.map((mode) => {
          const locked = mode.id !== "none" && !view.hasBuy;
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={form.lock === mode.id}
              disabled={locked}
              title={locked ? t.launch.basics.zeroNote : undefined}
              onClick={() => set("lock", mode.id)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-2 rounded-[10px] border border-line-strong bg-bg p-3.5 text-left text-text-3 max-sm:px-2.5 max-sm:py-3",
                "aria-pressed:border-pos/60 aria-pressed:bg-pos/5 aria-pressed:[&>span:first-child]:text-pos",
                locked && "cursor-not-allowed opacity-45",
              )}
            >
              <span aria-hidden="true">{mode.icon}</span>
              <strong className="max-w-full text-[13px] font-medium text-text [overflow-wrap:anywhere] max-sm:text-[12px]">{mode.title}</strong>
              <small className="max-w-full text-[11px] leading-[1.6] hyphens-auto [overflow-wrap:anywhere] max-sm:text-[10px] max-sm:leading-[1.5]">{mode.sub}</small>
            </button>
          );
        })}
      </div>
      {view.locks ? (
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            {form.lock === "linear" ? (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <label htmlFor="launch-months" className="text-[13px] text-text-2">
                    {k.vesting}
                  </label>
                  <strong className="text-right font-mono text-[12px] font-normal text-pos">{fmt(k.vestingValue, { months: form.months, days })}</strong>
                </div>
                <input id="launch-months" type="range" min={1} max={12} step={1} value={form.months} onChange={(event) => set("months", Number(event.target.value))} className={RANGE} />
                <div className={SCALE}>
                  <span>{k.month}</span>
                  <span>{fmt(k.months, { months: 6 })}</span>
                  <span>{fmt(k.months, { months: 12 })}</span>
                </div>
                <p className={`${HELP} mt-2.5`}>{k.monthHelp}</p>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span id="launch-duration-label" className="text-[13px] text-text-2">
                    {k.duration}
                  </span>
                  <strong className="font-mono text-[12px] font-normal text-pos">{fmt(k.days, { days })}</strong>
                </div>
                <div role="group" aria-labelledby="launch-duration-label" className="flex gap-1.5">
                  {TIME_LOCK_PRESETS.map((preset) => (
                    <Option key={preset} tone="crew" pressed={form.days === preset} onClick={() => set("days", preset)}>
                      {fmt(k.days, { days: preset })}
                    </Option>
                  ))}
                </div>
                <label htmlFor="launch-days" className="mt-3 mb-1.5 block text-[12px] text-text-3">
                  {k.customDays}
                </label>
                <input
                  id="launch-days"
                  type="number"
                  inputMode="numeric"
                  min={MIN_LOCK_DAYS}
                  max={MAX_LOCK_DAYS}
                  step={1}
                  value={form.days}
                  onChange={(event) => set("days", Number(event.target.value))}
                  onBlur={() => set("days", settleDays(form.days))}
                  aria-invalid={state.showsError("days") ? true : undefined}
                  className="w-28 rounded-lg border border-line-strong bg-bg px-3 py-2 font-mono text-[13px] text-text"
                />
              </div>
            )}
            <div className="mt-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <label htmlFor="launch-share" className="text-[13px] text-text-2">
                  {k.share}
                </label>
                <strong className="font-mono text-[12px] font-normal text-pos">{form.share}%</strong>
              </div>
              <input id="launch-share" type="range" min={50} max={100} step={5} value={form.share} onChange={(event) => set("share", Number(event.target.value))} className={RANGE} />
              <div className={SCALE}>
                <span>50%</span>
                <span>80% · {t.launch.economics.tierIronclad}</span>
                <span>100%</span>
              </div>
            </div>
            <dl className="m-0 mt-5 grid grid-cols-2 gap-4 border-t border-line pt-3.5">
              <div>
                <dt className="text-[11px] text-text-3">{k.locked}</dt>
                <dd className="m-0 mt-1.5 font-mono text-[17px] font-medium text-pos">{formatTokens(view.locked)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-text-3">{k.available}</dt>
                <dd className="m-0 mt-1.5 font-mono text-[17px] font-medium">{formatTokens(view.liquid)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-line bg-bg p-4 [background-image:linear-gradient(145deg,rgb(var(--neon-rgb)/0.07),transparent_60%)]">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-text-3 uppercase">{k.commitment}</span>
            <span className="mt-2.5 flex w-max max-w-full items-center gap-1.5 rounded border border-pos/25 px-1.5 py-0.5 text-[11px] text-pos">
              <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
              {tierName}
            </span>
            <strong className="mt-3 block font-mono text-[25px] leading-8 font-medium tracking-[-0.04em]">{formatTokens(view.locked)}</strong>
            {ticker ? <span className="block font-mono text-[12px] text-text-3">${ticker}</span> : null}
            <VestingChart
              type={form.lock === "time" ? "time" : "linear"}
              label={fmt(form.lock === "time" ? k.chartTime : k.chartLinear, { days })}
              ticks={["0", fmt(k.days, { days: Math.round(days / 2) }), fmt(k.days, { days })]}
            />
            <p className="m-0 mt-2 text-[11px] leading-[1.7] text-text-3">{fmt(form.lock === "time" ? k.chartTime : k.chartLinear, { days })}</p>
            <p className="m-0 mt-3 border-t border-line pt-2.5 text-[11px] leading-[1.6] text-pos">{fmt(k.creatorUpTo, { pct: bpsText(view.creatorMax) })}</p>
          </div>
        </div>
      ) : null}
      <p className={cn("m-0 mt-5 rounded-lg border px-3.5 py-3 text-[12px] leading-[1.7]", view.tier === "none" ? "border-warn/25 bg-warn/7 text-warn" : "border-pos/25 bg-pos/5 text-pos")}>{message}</p>
      {view.locks ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-[12px] leading-[1.6] text-text-2">
          <li>{view.score.lockCounts ? k.scoreYes : k.scoreNo}</li>
          <li>{view.score.lockedBadge ? k.badgeYes : k.badgeNo}</li>
        </ul>
      ) : null}
    </StepCard>
  );
}
