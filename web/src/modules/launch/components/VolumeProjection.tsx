"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { VOLUMES } from "../lib/form";
import type { StudioProps } from "./types";

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: value % 1 === 0 && value >= 1000 ? 0 : 2, maximumFractionDigits: 2 })}`;
const short = (value: number) => `$${value >= 1000 ? `${value / 1000}K` : value}`;

/**
 * "A day in your economy": what an example day of curve volume would send to
 * the Crew, the creator and tonkfun.fun (the three add up to the trade fee),
 * and what holding 1% of the eligible supply would earn from the Crew's part.
 * Illustrative.
 */
export function VolumeProjection({ state, view }: Pick<StudioProps, "state" | "view">) {
  const { t } = useI18n();
  const e = t.launch.economics;
  const figures: [string, string, string][] = [
    [usd(view.crewDaily), e.toCrew, "text-pos"],
    [usd(view.creatorDaily), e.toYou, "text-gold"],
    [usd(view.protocolDaily), e.toProtocol, ""],
    [usd(view.holderDaily), e.holder, ""],
  ];
  return (
    <div className="mt-6 rounded-xl border border-line bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong className="block text-[13px] font-medium">{e.day}</strong>
          <span className="mt-1 block text-[11px] text-text-3">{e.daySub}</span>
        </div>
        <div role="group" aria-label={e.volume} className="flex flex-none gap-0.5 rounded-lg border border-line bg-bg p-[3px]">
          {VOLUMES.map((volume) => (
            <button
              key={volume}
              type="button"
              aria-pressed={state.form.volume === volume}
              onClick={() => state.set("volume", volume)}
              className="min-h-8 rounded-md px-2.5 font-mono text-[11px] text-text-3 aria-pressed:bg-input aria-pressed:text-text"
            >
              {short(volume)}
            </button>
          ))}
        </div>
      </div>
      <dl className="m-0 mt-5 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        {figures.map(([value, label, tone]) => (
          <div key={label} className="min-w-0">
            <dd className={cn("m-0 font-mono text-[19px] leading-6 font-medium tracking-[-0.04em]", tone)}>{value}</dd>
            <dt className="mt-1 text-[11px] leading-[1.6] text-text-3">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-4 border-t border-line pt-3 text-[11px] leading-[1.8] text-text-3">{e.dayNote}</p>
    </div>
  );
}
