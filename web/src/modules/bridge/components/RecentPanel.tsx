"use client";

import { Route } from "lucide-react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { networkOf } from "../lib/networks";
import { clearFinished, inFlight } from "../lib/recent";
import type { RecentTransfer, TransferState } from "../lib/types";

const TONE: Record<TransferState, string> = {
  source: "bg-accent/8 text-accent-text",
  transit: "bg-accent/8 text-accent-text",
  delivered: "bg-pos/12 text-pos",
  refunded: "bg-warn/12 text-warn",
  failed: "bg-neg/12 text-neg",
};

interface RecentPanelProps {
  transfers: readonly RecentTransfer[];
  onStart: () => void;
  onOpen: (id: string) => void;
}

/** The Recent tab: transfers made on this device, newest first, each followed through to arrival. */
export function RecentPanel({ transfers, onStart, onOpen }: RecentPanelProps) {
  const { t, lang } = useI18n();
  const r = t.bridge.recent;
  const when = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (!transfers.length) {
    return (
      <div className="px-5 pt-[65px] pb-20 text-center">
        <div className="mx-auto mb-5 flex size-[60px] items-center justify-center rounded-[18px] border border-line bg-raised text-accent-text">
          <Route size={25} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h2 className="font-display text-[22px] font-bold tracking-[-0.6px]">{r.emptyTitle}</h2>
        <p className="m-0 mt-3 mb-[23px] text-[13px] leading-[1.8] text-text-3">{r.emptyBody}</p>
        <button type="button" onClick={onStart} className="min-h-10 rounded-lg border border-line-strong px-4 text-[13px] font-semibold hover:bg-raised">
          {r.start}
        </button>
      </div>
    );
  }
  const finished = transfers.some((transfer) => !inFlight(transfer));
  return (
    <div>
      <div className="flex items-center justify-between px-6 py-5 text-[12px] text-text-2 max-[599px]:px-4">
        <span>{r.title}</span>
        {finished ? (
          <button type="button" onClick={clearFinished} className="rounded px-1 text-[11px] text-text-3 hover:text-text">
            {r.clear}
          </button>
        ) : null}
      </div>
      <ol className="m-0 list-none p-0">
        {transfers.map((transfer) => (
          <li key={transfer.id} className="mx-5 border-b border-line last:border-b-0 max-[599px]:mx-4">
            <button type="button" aria-haspopup="dialog" onClick={() => onOpen(transfer.id)} className="flex w-full items-center justify-between gap-3 rounded py-4 text-left">
              <span className="min-w-0">
                <strong className="block truncate text-[12px] font-semibold">
                  {networkOf(transfer.from.network)?.name} → {networkOf(transfer.to.network)?.name}
                </strong>
                <small className="mt-1 block truncate font-mono text-[11px] text-text-3">
                  {transfer.from.amount} {transfer.from.symbol} → {transfer.to.amount} {transfer.to.symbol}
                </small>
              </span>
              <span className="flex flex-none flex-col items-end gap-1">
                <span className={cn("rounded px-1.5 py-[3px] text-[10px] font-semibold whitespace-nowrap", TONE[transfer.state])}>{r.state[transfer.state]}</span>
                <time dateTime={new Date(transfer.at).toISOString()} className="text-[10px] text-text-3">
                  {when.format(transfer.at)}
                </time>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="m-0 p-5 text-center text-[10px] text-text-3">{r.note}</p>
    </div>
  );
}
