"use client";

import { ArrowDown, ArrowRight, ArrowUpRight, Check, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { SwapQuote, SwapToken } from "@/shared/types/swap";
import { IconButton } from "@/shared/ui/IconButton";
import { pctText, quoteView } from "./display";
import { explorerTx } from "./tokens";
import type { RunState } from "./useSwapRun";

interface SwapReviewProps {
  open: boolean;
  onClose: () => void;
  from: SwapToken;
  to: SwapToken;
  /** The amount being paid, as typed. */
  amount: string;
  /** The live quote; the run's firm quote takes over once there is one. */
  quote: SwapQuote | null;
  run: RunState;
  onConfirm: () => void;
}

const WORKING = new Set(["preparing", "approve", "approving", "sign", "sending", "confirming"]);

/**
 * "One last look.": both amounts, the minimum, fees, network cost, slippage
 * and route, then Confirm. While the swap runs it says what's happening
 * (approve, sign in the wallet, confirming); it ends in a link to the
 * transaction or the reason it didn't go through.
 */
export function SwapReview({ open, onClose, from, to, amount, quote, run, onConfirm }: SwapReviewProps) {
  const { t } = useI18n();
  const s = t.swap;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shown = run.quote ?? quote;
  const view = shown ? quoteView(shown, from, to) : null;
  const working = WORKING.has(run.step);
  const chain = CHAINS[from.chain].name;
  const stepText: Record<string, string> = {
    preparing: s.steps.preparing,
    approve: fmt(s.steps.approve, { symbol: from.symbol }),
    approving: fmt(s.steps.approving, { symbol: from.symbol }),
    sign: s.steps.sign,
    sending: s.steps.sending,
    confirming: fmt(s.steps.confirming, { chain }),
  };
  const errorKey = run.error === "no-route" ? "noRoute" : run.error;
  const errorText = errorKey ? ((s.errors as Record<string, string>)[errorKey] ?? s.errors.unavailable) : null;
  const rows: [string, string][] = view
    ? [
        [s.minReceived, `${view.minOut} ${to.symbol}`],
        [s.fee, view.fee ? `${view.fee.amount} (${view.fee.pct})` : s.noFee],
        [s.networkCost, view.network ?? "—"],
        [s.slippageTitle, pctText(shown?.slippageBps ?? 100)],
        ...(view.impact ? [[s.priceImpact, view.impact] as [string, string]] : []),
        [s.route, view.route],
      ]
    : [];
  return (
    <dialog
      ref={ref}
      aria-labelledby="swap-review-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-2xl border border-line-strong bg-surface p-0 text-text shadow-menu backdrop:bg-[var(--scrim)] max-md:mb-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
    >
      <div className="flex flex-col gap-4 p-5 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="swap-review-title" className="font-display text-[22px] leading-7 font-extrabold tracking-[-0.03em]">
              {s.reviewTitle}
            </h2>
            <span className="font-mono text-[11px] text-text-3">
              {from.symbol} → {to.symbol}
            </span>
          </div>
          <IconButton label={t.prefs.close} size={32} onClick={onClose} className="rounded-[10px]">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-bg p-4">
          <span className="text-[11px] text-text-3">{s.pay}</span>
          <span className="font-mono text-[20px] leading-7 font-medium tracking-[-0.03em] [overflow-wrap:anywhere]">
            {amount} {from.symbol}
          </span>
          <ArrowDown size={15} strokeWidth={2} className="my-0.5 text-accent-text" aria-hidden="true" />
          <span className="text-[11px] text-text-3">{s.receiveEstimated}</span>
          <span className="font-mono text-[20px] leading-7 font-medium tracking-[-0.03em] [overflow-wrap:anywhere]">
            {view ? view.out : "—"} {to.symbol}
          </span>
        </div>
        {rows.length ? (
          <dl className="m-0 flex flex-col gap-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-[12px]">
                <dt className="text-text-3">{label}</dt>
                <dd className="m-0 text-right font-mono text-text-2 [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div role="status" aria-live="polite" className="min-h-5 text-[12px]">
          {working ? (
            <span className="inline-flex items-center gap-2 text-text-2">
              <LoaderCircle size={14} strokeWidth={2} className="tk-spin" aria-hidden="true" />
              {stepText[run.step]}
            </span>
          ) : run.step === "done" ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-pos">
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
              {s.steps.done}
            </span>
          ) : run.step === "failed" ? (
            <span className="inline-flex items-start gap-2 text-neg">
              <TriangleAlert size={14} strokeWidth={2.2} className="mt-0.5 flex-none" aria-hidden="true" />
              <span>
                {s.steps.failed}. {errorText}
              </span>
            </span>
          ) : (
            <span className="text-text-3">{s.signNote}</span>
          )}
        </div>
        {run.tx ? (
          <a href={explorerTx(from.chain, run.tx)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start rounded text-[12px] font-semibold text-accent-text">
            {s.viewTx}
            <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
        {run.step === "done" ? (
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line-strong bg-raised px-4 text-[13px] font-semibold hover:bg-input">
            {s.done}
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={working || !shown}
            className={cn(
              "inline-flex min-h-11 items-center justify-between gap-2 rounded-lg px-4 text-[13px] font-semibold",
              working || !shown ? "cursor-not-allowed border border-line-strong bg-input text-text-2" : "bg-cta text-on-cta hover:brightness-110",
            )}
          >
            {run.step === "failed" ? s.tryAgain : s.confirm}
            {working ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin" aria-hidden="true" /> : <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
          </button>
        )}
      </div>
    </dialog>
  );
}
