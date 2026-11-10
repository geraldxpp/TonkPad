"use client";

import { ArrowUpRight, History } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { clearRecent, useRecentSwaps } from "@/shared/swap/recent";
import { explorerTx } from "@/shared/swap/tokens";
import { ChainMark } from "@/shared/ui/ChainMark";

const TONE = { pending: "bg-warn/12 text-warn", confirmed: "bg-pos/12 text-pos", failed: "bg-neg/12 text-neg" } as const;

/** The Recent tab: swaps made on this device, newest first, each linking to its transaction. */
export function RecentList({ onStart }: { onStart: () => void }) {
  const { t, lang } = useI18n();
  const s = t.swap;
  const swaps = useRecentSwaps();
  const when = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (!swaps.length) {
    return (
      <div className="flex flex-col items-center px-6 pt-14 pb-16 text-center">
        <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-line bg-raised text-accent-text">
          <History size={24} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2 className="font-display text-[20px] leading-6 font-bold tracking-[-0.02em]">{s.recentEmptyTitle}</h2>
        <p className="mt-2 mb-6 max-w-72 text-[13px] leading-5 text-text-3">{s.recentEmptyBody}</p>
        <button type="button" onClick={onStart} className="h-10 rounded-lg border border-line-strong px-4 text-[13px] font-semibold hover:bg-raised">
          {s.tab}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 text-[12px] text-text-3 max-md:px-4">
        <span>{s.recentDevice}</span>
        <button type="button" onClick={clearRecent} className="rounded px-1 text-[12px] text-text-3 hover:text-text">
          {s.recentClear}
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {swaps.map((swap) => (
          <li key={swap.id} className="mx-6 flex items-center gap-3 border-b border-line py-3.5 last:border-b-0 max-md:mx-4">
            <ChainMark chain={swap.chain} size={22} decorative />
            <div className="flex min-w-0 flex-auto flex-col gap-0.5">
              <span className="truncate font-mono text-[12px]">
                {swap.from.amount} {swap.from.symbol} → {swap.to.amount} {swap.to.symbol}
              </span>
              <time dateTime={new Date(swap.at).toISOString()} className="text-[11px] text-text-3">
                {when.format(swap.at)}
              </time>
            </div>
            <span className={cn("flex-none rounded px-1.5 py-0.5 text-[11px] font-semibold", TONE[swap.state])}>{s.state[swap.state]}</span>
            <a href={explorerTx(swap.chain, swap.tx)} target="_blank" rel="noopener noreferrer" aria-label={s.viewTx} title={s.viewTx} className="flex-none rounded p-1 text-text-3 hover:text-text">
              <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
