"use client";

import { ArrowRight, ArrowUpRight, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { buttonClasses } from "@/shared/ui/Button";
import { Sheet } from "@/shared/ui/Sheet";
import { Logo } from "@/modules/shell/components/Logo";
import { explorerTxOf, networkOf } from "../lib/networks";
import type { RecentTransfer, TransferState } from "../lib/types";
import { etaText } from "../lib/view";

type StepState = "pending" | "current" | "complete" | "stopped";

const STEP_STATES: Record<TransferState, [StepState, StepState, StepState]> = {
  source: ["current", "pending", "pending"],
  transit: ["complete", "current", "pending"],
  delivered: ["complete", "complete", "complete"],
  refunded: ["complete", "stopped", "pending"],
  failed: ["stopped", "pending", "pending"],
};

interface ProgressDialogProps {
  transfer: RecentTransfer | null;
  /** ms; the page's current time, for "taking longer than usual". */
  now: number;
  onClose: () => void;
  nextHref: string | null;
  nextLabel: string;
}

const TX_LINK = "inline-flex items-center gap-1 rounded text-[12px] text-text-2 hover:text-text";

/** Follows one transfer from the wallet to arrival, step by step. Closing it changes nothing: it carries on, and Recent keeps it. */
export function ProgressDialog({ transfer, now, onClose, nextHref, nextLabel }: ProgressDialogProps) {
  const { t, href } = useI18n();
  const b = t.bridge;
  const p = b.progress;
  const from = transfer ? networkOf(transfer.from.network) : null;
  const to = transfer ? networkOf(transfer.to.network) : null;
  const state = transfer?.state ?? "source";
  const copy: Record<TransferState, [string, string]> = {
    source: [p.source, fmt(p.sourceBody, { network: from?.name ?? "" })],
    transit: [p.transit, fmt(p.transitBody, { eta: transfer ? etaText(b, transfer.etaSeconds) : "" })],
    delivered: [p.delivered, fmt(p.deliveredBody, { network: to?.name ?? "" })],
    refunded: [p.refunded, fmt(p.refundedBody, { network: from?.name ?? "" })],
    failed: [p.failed, p.failedBody],
  };
  const steps: [string, string][] = [
    [p.step1Title, p.step1Body],
    [p.step2Title, p.step2Body],
    [p.step3Title, p.step3Body],
  ];
  const slow = transfer !== null && (state === "source" || state === "transit") && now - transfer.at > Math.max(transfer.etaSeconds * 4_000, 600_000);
  const [title, body] = copy[state];
  return (
    <Sheet open={transfer !== null} onClose={onClose} title={p.kicker}>
      {transfer && from && to ? (
        <div className="flex flex-col text-center">
          <div className="mx-auto mb-[22px] flex size-[66px] items-center justify-center rounded-[18px] border border-accent/25 bg-accent/4 shadow-[0_0_0_7px_rgb(var(--accent-rgb)/0.025)]">
            <Logo size={30} />
          </div>
          <h3 data-testid="bridge-progress-title" className="font-display text-[25px] leading-[1.2] font-extrabold tracking-[-0.8px] max-[599px]:text-[23px]">
            {title}
          </h3>
          <p role="status" aria-live="polite" className="m-0 mt-3 mb-5 text-[12px] text-text-3">
            {slow ? p.slow : body}
          </p>
          <div className="mb-6 rounded-[9px] border border-line bg-bg p-3.5">
            <strong className="block font-mono text-[23px] font-semibold tracking-[-0.8px] [overflow-wrap:anywhere]">
              {transfer.to.amount} {transfer.to.symbol}
            </strong>
            <span className="mt-1 block text-[11px] text-text-3">{fmt(p.onNetwork, { network: to.name, route: transfer.routeName })}</span>
          </div>
          <ol className="m-0 list-none p-0 text-left">
            {steps.map(([stepTitle, stepBody], index) => {
              const step = STEP_STATES[state][index];
              return (
                <li key={stepTitle} aria-current={step === "current" ? "step" : undefined} className="relative flex items-center gap-3 pb-[22px] not-last:after:absolute not-last:after:top-8 not-last:after:bottom-0.5 not-last:after:left-[15px] not-last:after:w-px not-last:after:bg-line last:pb-0">
                  <span className={cn("flex size-[31px] flex-none items-center justify-center rounded-full border font-mono text-[11px]", step === "complete" ? "border-pos bg-pos/7 text-pos" : step === "current" ? "border-accent bg-accent/8 text-accent-text" : step === "stopped" ? "border-warn bg-warn/8 text-warn" : "border-line-strong text-text-3")}>
                    {step === "current" ? <LoaderCircle size={14} strokeWidth={2} className="tk-spin" aria-hidden="true" /> : step === "stopped" ? <TriangleAlert size={13} strokeWidth={2.1} aria-hidden="true" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className={cn("block text-[12px] font-semibold", step === "current" || step === "complete" ? "text-text" : "text-text-3")}>{stepTitle}</strong>
                    <small className="mt-[3px] block text-[11px] text-text-3">{stepBody}</small>
                  </div>
                  {step === "complete" ? <Check size={16} strokeWidth={2.2} className="flex-none text-pos" aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-[15px]">
            <a href={explorerTxOf(from, transfer.sourceTx)} target="_blank" rel="noopener noreferrer" className={TX_LINK}>
              {fmt(p.viewOn, { network: from.name })}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
            </a>
            {transfer.destinationTx ? (
              <a href={explorerTxOf(state === "refunded" ? from : to, transfer.destinationTx)} target="_blank" rel="noopener noreferrer" className={TX_LINK}>
                {fmt(p.viewOn, { network: state === "refunded" ? from.name : to.name })}
                <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {state === "delivered" && nextHref ? (
            <Link href={href(nextHref)} className={buttonClasses("cta", "md", "mt-[17px] w-full justify-between")}>
              {nextLabel}
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" onClick={onClose} className={buttonClasses("secondary", "md", "mt-[17px] w-full")}>
              {state === "source" || state === "transit" ? p.keepGoing : p.close}
            </button>
          )}
          {state === "failed" ? <p className="m-0 mt-3 text-[11px] text-text-3">{p.support}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
