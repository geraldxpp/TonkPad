"use client";

import { Download, Eye, EyeOff } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatInteger, formatUsd } from "@/shared/lib/format";
import { formatDelta, formatPercent, MASK } from "../lib/format";
import type { PortfolioSeries } from "../lib/series";
import { type PortfolioRange, RANGES } from "../lib/types";
import type { PortfolioTotals } from "../lib/view";
import { BalanceChart } from "./BalanceChart";

const ICON = "inline-flex items-center justify-center rounded-lg text-text-3 hover:bg-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

interface BalanceCardProps {
  totals: PortfolioTotals;
  series: PortfolioSeries;
  range: PortfolioRange;
  onRange: (range: PortfolioRange) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onExport: () => void;
}

/** The headline: the total, how it moved over the range, its chart, and the three figures under it. */
export function BalanceCard({ totals, series, range, onRange, hidden, onToggleHidden, onExport }: BalanceCardProps) {
  const { t } = useI18n();
  const b = t.portfolio.balance;
  const first = series.points[0]?.[1] ?? totals.total;
  const delta = totals.total - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const mask = (text: string) => (hidden ? MASK : text);
  const description = fmt(b.chartDesc, { from: formatUsd(first), to: formatUsd(totals.total), period: b.period[range] });
  return (
    <section aria-labelledby="balance-title" className="min-w-0 overflow-hidden rounded-2xl border border-line pt-[23px] [background:radial-gradient(ellipse_at_40%_70%,rgb(var(--accent-rgb)/0.035),transparent_70%),var(--surface)] max-[699px]:pt-[18px]">
      <div className="flex items-center justify-between gap-3 px-[26px] max-lg:px-5">
        <div className="flex items-center gap-2">
          <h2 id="balance-title" className="text-[12px] font-medium tracking-[0.2px] text-text-2">
            {b.title}
          </h2>
          <button type="button" onClick={onToggleHidden} aria-pressed={hidden} aria-label={hidden ? b.show : b.hide} title={hidden ? b.show : b.hide} className={cn(ICON, "size-7")}>
            {hidden ? <EyeOff size={15} strokeWidth={1.9} aria-hidden="true" /> : <Eye size={15} strokeWidth={1.9} aria-hidden="true" />}
          </button>
        </div>
        <button type="button" onClick={onExport} disabled={hidden || totals.assets === 0} aria-label={hidden ? b.exportHidden : b.export} title={hidden ? b.exportHidden : b.export} className={cn(ICON, "size-[30px] border border-line")}>
          <Download size={14} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-[5px] flex flex-wrap items-baseline gap-x-2.5 px-[26px] max-lg:px-5">
        <strong data-testid="portfolio-total" className="min-w-0 font-mono text-[45px] leading-[1.25] font-medium tracking-[-2.4px] [overflow-wrap:anywhere] max-lg:text-[38px] max-lg:tracking-[-1.8px]">
          {mask(formatUsd(totals.total))}
        </strong>
        <span className="font-mono text-[10px] text-text-3">{b.currency}</span>
      </div>
      <div className="mt-[9px] flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-[27px] max-lg:px-[21px]">
        <span data-testid="portfolio-change" className={cn("font-mono text-[11px]", hidden ? "text-text-3" : delta < 0 ? "text-neg" : "text-pos")}>
          {mask(`${formatDelta(delta)} (${formatPercent(pct)})`)}
        </span>
        <span className="text-[10px] text-text-3">{b.period[range]}</span>
      </div>
      <div className="mx-3.5 mt-3.5 h-[154px] max-[699px]:mx-[9px] max-[699px]:mt-[19px] max-[699px]:h-[136px]">
        <BalanceChart points={series.points} hidden={hidden} description={description} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-[26px] pt-1 pb-3 max-lg:px-5">
        <span className="font-mono text-[10px] text-text-3">{hidden ? b.hidden : b.start[range]}</span>
        <div role="group" aria-label={b.rangeLabel} className="flex items-center justify-center gap-1">
          {RANGES.map((id) => (
            <button key={id} type="button" aria-pressed={id === range} onClick={() => onRange(id)} className={cn("min-h-[29px] min-w-[33px] rounded-[5px] px-2 py-1.5 font-mono text-[10px]", id === range ? "bg-accent/9 text-accent-text" : "text-text-3 hover:text-text")}>
              {id}
            </button>
          ))}
        </div>
        <span className="justify-self-end font-mono text-[10px] text-text-3">{hidden ? b.hidden : b.now}</span>
      </div>
      <p className="m-0 px-[26px] pb-3.5 text-[10px] leading-[1.5] text-text-3 max-lg:px-5">
        {series.coverage >= 0.995 ? b.chartNote : `${b.chartNote} ${fmt(b.coverage, { pct: `${Math.round(series.coverage * 100)}%` })}`}
      </p>
      <dl className="m-0 grid grid-cols-[1fr_0.8fr_1.5fr] border-t border-line bg-bg/30">
        <div className="min-w-0 px-[26px] py-[15px] max-lg:px-[17px] max-lg:py-3.5">
          <dt className="text-[10px] text-text-3">{b.assets}</dt>
          <dd className="m-0 mt-1 font-mono text-[16px] font-medium tracking-[-0.5px] max-lg:text-[14px]">{formatInteger(totals.assets)}</dd>
        </div>
        <div className="min-w-0 border-l border-line px-[26px] py-[15px] max-lg:px-[17px] max-lg:py-3.5">
          <dt className="text-[10px] text-text-3">{b.networks}</dt>
          <dd className="m-0 mt-1 font-mono text-[16px] font-medium tracking-[-0.5px] max-lg:text-[14px]">{formatInteger(totals.networks)}</dd>
        </div>
        <div className="min-w-0 border-l border-line px-[26px] py-[15px] max-lg:px-[17px] max-lg:py-3.5">
          <dt className="text-[10px] text-text-3">{b.stablecoins}</dt>
          <dd className="m-0 mt-1 font-mono text-[16px] font-medium tracking-[-0.5px] [overflow-wrap:anywhere] max-lg:text-[14px]">{mask(formatUsd(totals.stablecoins))}</dd>
        </div>
      </dl>
    </section>
  );
}
