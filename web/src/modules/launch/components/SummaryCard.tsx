"use client";

import { ArrowUpRight, ChevronDown, Rocket } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth, formatTokens, percentText } from "@/shared/tonk/format";
import { ChainMark } from "@/shared/ui/ChainMark";
import { agentLabel, feeLabel, lockLabel } from "../lib/labels";
import { pairText, type StudioProps } from "./types";

interface SummaryCardProps extends Pick<StudioProps, "state" | "view" | "settings" | "unit"> {
  chainName: string;
  /** The main button. */
  action: ReactNode;
  /** Under the button: "You confirm in your own wallet.", or the demo's note. */
  note: string;
  /** Where to get coins when the wallet is short, on a testnet. */
  faucetUrl: string | null;
}

/** "Your launch, at a glance.": every setting in one list, what the creator pays now, and the main button. */
export function SummaryCard({ state, view, settings, unit, chainName, action, note, faucetUrl }: SummaryCardProps) {
  const { t } = useI18n();
  const l = t.launch;
  const s = l.summary;
  const { form } = state;
  const eth = (wei: bigint) => `${formatEth(wei)} ${unit}`;
  const rows: [string, ReactNode][] = [
    [
      s.network,
      <>
        <ChainMark chain="rh" size={13} decorative />
        {chainName}
      </>,
    ],
    [
      s.pad,
      <>
        <span className="whitespace-nowrap">Tonkfun Native ·</span>
        <span>{pairText(form.ticker)}</span>
      </>,
    ],
    [s.devBuy, view.hasBuy ? eth(view.devBuy) : l.basics.none],
    [s.allocation, view.hasBuy ? `${formatTokens(view.bought)} · ${percentText(view.supplyPct)}` : "—"],
    [l.steps.lock, lockLabel(l, form, view.locks)],
    [l.economics.crewTitle, form.crew ? fmt(s.crewValue, { pct: feeLabel(l, form.crew) }) : l.economics.off],
    [l.economics.creatorTitle, fmt(s.creatorValue, { pct: feeLabel(l, view.creator) })],
    [s.protocol, s.protocolValue],
    [l.steps.agent, agentLabel(l, form)],
    [s.fee, eth(settings.launchFee)],
  ];
  return (
    <section aria-labelledby="launch-summary-title" className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="launch-summary-title" className="m-0 font-display text-[18px] leading-6 font-extrabold tracking-[-0.02em]">
          {s.title}
        </h2>
        <Rocket size={16} strokeWidth={1.8} className="flex-none text-accent-text" aria-hidden="true" />
      </div>
      <dl className="m-0">
        {rows.map(([label, value]) => (
          <div key={label} className="my-2.5 flex items-start justify-between gap-3 text-[12px] leading-[1.6]">
            <dt className="flex-none text-text-3">{label}</dt>
            <dd className="m-0 flex flex-wrap items-center justify-end gap-x-1.5 text-right font-mono [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      {/* On desktop the column scrolls by itself: what you pay and the button stay at its foot. */}
      <div className="bg-surface min-[1200px]:sticky min-[1200px]:bottom-0 min-[1200px]:pb-3">
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
          <span className="text-[13px] font-medium">{s.pay}</span>
          <div className="min-w-0 text-right">
            <strong data-testid="launch-pay" className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.04em] whitespace-nowrap">
              {eth(view.payNow)}
            </strong>
            <small className="mt-0.5 block font-mono text-[10px] text-text-3">{s.gas}</small>
          </div>
        </div>
        <div className="mt-4">{action}</div>
        {faucetUrl ? (
          <a href={faucetUrl} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1 rounded text-[12px] font-semibold text-accent-text">
            {l.action.faucet}
            <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
        <p className="m-0 mt-2.5 text-center text-[11px] leading-[1.7] text-text-3">{note}</p>
      </div>
      <details className="group mt-3.5 border-t border-line pt-3 min-[1200px]:mt-0.5">
        <summary className="flex cursor-pointer list-none justify-between rounded text-[12px] text-text-2 [&::-webkit-details-marker]:hidden">
          {s.included}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="text-text-3 transition-transform group-open:rotate-180" />
        </summary>
        <p className="m-0 mt-2.5 text-[12px] leading-[1.8] text-text-3">{s.includedBody}</p>
      </details>
    </section>
  );
}
