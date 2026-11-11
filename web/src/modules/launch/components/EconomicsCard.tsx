"use client";

import { Users, Wallet } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { PROTOCOL_FEE_BPS } from "@/shared/tonk/curve";
import { bpsText, formatEth } from "@/shared/tonk/format";
import { CREATOR_OPTIONS, CREW_OPTIONS, type LockTier, TIER_CREATOR_MAX } from "@/shared/tonk/rules";
import type { Notice } from "../lib/form";
import type { StudioProps } from "./types";
import { HELP, Option, StepCard } from "./ui";
import { VolumeProjection } from "./VolumeProjection";

const MAX_BPS = 500;
const width = (bps: number) => ({ width: `${(bps / MAX_BPS) * 100}%` });

/** Card 3: the 1% protocol fee plus the Crew and Creator Rewards that share a 4% pool, and what a day of volume would pay. */
export function EconomicsCard({ state, view, unit, hiddenOnPhone }: StudioProps & { hiddenOnPhone: boolean }) {
  const { t } = useI18n();
  const e = t.launch.economics;
  const { form, set } = state;
  const label = (bps: number) => (bps === 0 ? e.off : bpsText(bps));
  const notice = (item: Notice) =>
    item.key === "noBuy" ? e.noticeNoBuy
    : item.key === "devBuyMax" ? fmt(e.noticeDevBuyMax, { amount: `${formatEth(item.amount)} ${unit}` })
    : fmt({ creatorTier: e.noticeCreatorTier, creatorPool: e.noticeCreatorPool, crewPool: e.noticeCrewPool }[item.key], { pct: bpsText(item.bps) });
  const tiers: { id: LockTier; name: string; needs: string }[] = [
    { id: "none", name: e.tierNone, needs: e.tierNoneNeeds },
    { id: "standard", name: e.tierStandard, needs: e.tierStandardNeeds },
    { id: "ironclad", name: e.tierIronclad, needs: e.tierIroncladNeeds },
  ];
  const total = `${bpsText(view.totalBps)} ${e.ofMax}`;
  return (
    <StepCard
      id="step-3"
      number="03"
      tone="creator"
      title={t.launch.steps.economics}
      subtitle={e.subtitle}
      hiddenOnPhone={hiddenOnPhone}
      aside={<span className="flex-none rounded border border-line px-1.5 py-1 font-mono text-[10px] whitespace-nowrap text-text-3 max-sm:hidden">{e.max}</span>}
    >
      <div className="mb-6 rounded-xl border border-line bg-bg p-4">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-text-2">{e.total}</span>
          <strong className="font-mono text-[18px] font-medium tracking-[-0.02em]">
            {bpsText(view.totalBps)} <small className="font-sans text-[11px] font-normal tracking-normal text-text-3">{e.ofMax}</small>
          </strong>
        </div>
        <div role="img" aria-label={`${e.total}: ${total}`} className="mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-[3px]">
          <span style={width(PROTOCOL_FEE_BPS)} className="bg-text-3" />
          <span style={width(form.crew)} className="bg-pos transition-[width] duration-200" />
          <span style={width(form.creator)} className="bg-gold transition-[width] duration-200" />
          <span className="min-w-0 flex-auto border border-dashed border-line-strong bg-raised" />
        </div>
        <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11px] text-text-3">
          {(
            [
              [e.protocol, PROTOCOL_FEE_BPS, "bg-text-3"],
              [e.crew, form.crew, "bg-pos"],
              [e.creator, form.creator, "bg-gold"],
            ] as const
          ).map(([name, bps, dot]) => (
            <li key={name} className="flex items-center gap-1.5">
              <i aria-hidden="true" className={cn("size-1.5 rounded-sm", dot)} />
              {name} <strong className="font-mono font-normal text-text-2">{bpsText(bps)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="pb-5">
        <div className="mb-3.5 flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-raised text-pos">
            <Users size={15} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-auto">
            <h3 id="launch-crew-title" className="m-0 text-[14px] font-semibold">
              {e.crewTitle}
            </h3>
            <p className="m-0 mt-0.5 text-[11px] text-text-3">{e.crewSub}</p>
          </div>
          <strong className="font-mono text-[16px] font-medium text-pos">{label(form.crew)}</strong>
        </div>
        <div role="group" aria-labelledby="launch-crew-title" className="grid grid-cols-3 gap-1.5 sm:flex">
          {CREW_OPTIONS.map((bps) => (
            <Option key={bps} tone="crew" pressed={form.crew === bps} onClick={() => set("crew", bps)}>
              {label(bps)}
            </Option>
          ))}
        </div>
        <p className={`${HELP} mt-3`}>{e.crewHelp}</p>
      </div>

      <div className="border-t border-line pt-5">
        <div className="mb-3.5 flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-raised text-gold">
            <Wallet size={15} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-auto">
            <h3 id="launch-creator-title" className="m-0 text-[14px] font-semibold">
              {e.creatorTitle}
            </h3>
            <p className="m-0 mt-0.5 text-[11px] text-text-3">{e.creatorSub}</p>
          </div>
          <strong className="font-mono text-[16px] font-medium text-gold">{label(form.creator)}</strong>
        </div>
        <div role="group" aria-labelledby="launch-creator-title" className="grid grid-cols-4 gap-1.5 sm:flex">
          {CREATOR_OPTIONS.map((bps) => {
            const locked = bps > view.creatorMax;
            return (
              <Option key={bps} tone="creator" pressed={form.creator === bps} disabled={locked} title={locked ? e.needsLock : undefined} onClick={() => set("creator", bps)}>
                {label(bps)}
              </Option>
            );
          })}
        </div>
        <ul className="m-0 mt-3.5 grid list-none gap-2 p-0 sm:grid-cols-3">
          {tiers.map((tier) => (
            <li
              key={tier.id}
              aria-current={view.tier === tier.id ? "true" : undefined}
              className="rounded-lg border border-line px-2.5 py-2.5 text-text-3 aria-[current=true]:border-gold/40 aria-[current=true]:bg-gold/4 aria-[current=true]:[&>span]:text-gold aria-[current=true]:[&>strong]:text-gold"
            >
              <span className="block text-[11px]">{tier.name}</span>
              <strong className="mt-1 block font-mono text-[12px] font-normal text-text-2">{fmt(e.upTo, { pct: bpsText(TIER_CREATOR_MAX[tier.id]) })}</strong>
              <small className="mt-1 block text-[10px]">{tier.needs}</small>
            </li>
          ))}
        </ul>
        <p className={`${HELP} mt-2.5`}>{e.tierFloor}</p>
        <p className={`${HELP} mt-2`}>{e.poolNote}</p>
        <div role="status" aria-live="polite">
          {state.notices.map((item) => (
            <p key={item.key} className="m-0 mt-2.5 rounded-lg border border-warn/25 bg-warn/7 px-3 py-2.5 text-[12px] leading-[1.6] text-warn">
              {notice(item)}
            </p>
          ))}
        </div>
      </div>
      <VolumeProjection state={state} view={view} />
    </StepCard>
  );
}
