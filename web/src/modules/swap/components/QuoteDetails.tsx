"use client";

import { ArrowRightLeft, ChevronDown } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { pctText, type QuoteView } from "@/shared/swap/display";
import type { SwapToken } from "@/shared/types/swap";

interface QuoteDetailsProps {
  view: QuoteView | null;
  from: SwapToken;
  to: SwapToken;
  slippageBps: number;
  /** A quote is on its way. */
  loading: boolean;
}

/** The rate line, then the folded details: minimum, fee, network cost, impact and route. */
export function QuoteDetails({ view, from, to, slippageBps, loading }: QuoteDetailsProps) {
  const { t } = useI18n();
  const s = t.swap;
  const rows: [string, string][] = view
    ? [
        [s.minReceived, `${view.minOut} ${to.symbol}`],
        [s.fee, view.fee ? `${view.fee.amount} (${view.fee.pct})` : s.noFee],
        [s.networkCost, view.network ?? "—"],
        ...(view.impact ? [[s.priceImpact, view.impact] as [string, string]] : []),
        [s.route, view.route],
      ]
    : [];
  return (
    <div className="flex flex-col">
      <div className="flex min-h-12 items-center gap-2 font-mono text-[12px] text-text-2">
        <ArrowRightLeft size={14} strokeWidth={1.9} className="flex-none text-text-3" aria-hidden="true" />
        <span className="min-w-0 truncate">{view?.rate ? fmt(s.rate, { from: from.symbol, amount: view.rate, to: to.symbol }) : loading ? s.quoting : "—"}</span>
        <span className="ml-auto flex-none font-sans text-[11px] text-text-3">{s.refreshes}</span>
      </div>
      <details className="group border-y border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[12px] text-text-2 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-baseline gap-2">
            {s.details}
            <span className="truncate text-[11px] text-text-3">
              {view ? fmt(s.detailsSummary, { slippage: pctText(slippageBps), fee: view.fee?.pct ?? "0%" }) : fmt(s.slippage, { pct: pctText(slippageBps) })}
            </span>
          </span>
          <ChevronDown size={15} strokeWidth={2} className="flex-none text-text-3 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="m-0 flex flex-col gap-2 pb-4">
          {rows.length ? (
            rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-[12px]">
                <dt className="text-text-3">{label}</dt>
                <dd className="m-0 text-right font-mono text-text-2 [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))
          ) : (
            <div className="text-[12px] text-text-3">{s.enterAmount}</div>
          )}
        </dl>
      </details>
    </div>
  );
}
