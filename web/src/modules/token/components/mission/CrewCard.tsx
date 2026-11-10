"use client";

import { Zap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatUsd } from "@/shared/lib/format";
import type { CrewRewards } from "@/shared/types/token-detail";

/** Fourteen days of payouts across the card; today's bar in full gold. */
function PayoutBars({ daily, label }: { daily: readonly number[]; label: string }) {
  const top = Math.max(1, ...daily);
  return (
    <div role="img" aria-label={label} className="flex h-[38px] items-end gap-[5px] border-b border-gold/20">
      {daily.map((value, i) => (
        <span
          key={i}
          className={i === daily.length - 1 ? "flex-1 rounded-t-[2px] bg-gold" : "flex-1 rounded-t-[2px] bg-gold/45"}
          style={{ height: `${Math.max(10, Math.round((value / top) * 100))}%` }}
        />
      ))}
    </div>
  );
}

/** "Your crew. Your upside.": what holders have been paid from every trade, and the last 14 days. */
export function CrewCard({ crew }: { crew: CrewRewards }) {
  const { t } = useI18n();
  const c = t.token.crew;
  const tl = t.token.tele;
  return (
    <section
      aria-labelledby="crew-title"
      className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-[linear-gradient(135deg,color-mix(in_srgb,var(--gold)_5%,var(--surface)),var(--surface))] p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-8 flex-none items-center justify-center rounded-lg border border-gold/20 bg-gold/8 text-gold">
          <Zap size={16} fill="currentColor" stroke="none" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="crew-title" className="text-[14px] font-semibold">
            {c.title}
          </h2>
          <p className="text-[11px] text-text-3">{fmt(c.sub, { pct: crew.sharePct })}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[24px] leading-7 font-semibold tracking-[-0.04em] text-gold">{formatUsd(crew.paidUsd, 0)}</span>
        <span className="text-[11px] text-text-3">{c.total}</span>
      </div>
      <div className="flex flex-col gap-2">
        <PayoutBars daily={crew.daily} label={tl.payouts} />
        <div className="flex justify-between gap-2 text-[10px] text-text-3">
          <span>{c.days}</span>
          <span className="inline-flex items-center gap-1.5 text-pos">
            <span aria-hidden="true" className="size-1.5 animate-[tk-pulse_2s_ease-in-out_infinite] rounded-full bg-pos" />
            {fmt(tl.lastPayout, { seconds: crew.lastPayoutSeconds })}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-text-3">{tl.auto}</p>
    </section>
  );
}
