"use client";

import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { bpsText, formatEth, formatTokens, percentText } from "@/shared/tonk/format";
import type { RunState } from "../hooks/useLaunchRun";
import { agentLabel, feeLabel, lockLabel } from "../lib/labels";
import { Sheet } from "./Sheet";
import { LETTER_TILE, pairText, type StudioProps, tokenLetter } from "./types";

interface ReviewDialogProps extends Pick<StudioProps, "state" | "view" | "settings" | "unit"> {
  open: boolean;
  onClose: () => void;
  chainName: string;
  run: RunState;
  /** The note under the button: the wallet confirms, or this is a demo. */
  note: string;
  onConfirm: () => void;
}

/**
 * "One final look.": the launch's choices and its total call value, a box to
 * tick, then Launch. While it runs it says what is happening; if the
 * launchpad's settings moved it shows the new figures and waits again.
 */
export function ReviewDialog({ open, onClose, state, view, settings, unit, chainName, run, note, onConfirm }: ReviewDialogProps) {
  const { t } = useI18n();
  const l = t.launch;
  const r = l.review;
  const { form } = state;
  const [checked, setChecked] = useState(false);
  const working = run.step === "preparing" || run.step === "sign";
  const eth = (wei: bigint) => `${formatEth(wei)} ${unit}`;
  const ticker = `$${form.ticker.trim()}`;
  const errors: Record<string, string> = {
    rejected: t.swap.errors.rejected,
    network: t.swap.errors.network,
    funds: fmt(l.run.funds, { unit }),
    paused: l.run.paused,
    refused: l.run.refused,
    invalid: l.run.refused,
    busy: l.run.busy,
  };
  const rows: [string, string][] = [
    [l.summary.devBuy, view.hasBuy ? eth(view.devBuy) : l.basics.none],
    [r.received, view.hasBuy ? `${formatTokens(view.bought)} · ${percentText(view.supplyPct)}` : "—"],
    [r.commitment, lockLabel(l, form, view.locks)],
    [r.lockedAvailable, view.hasBuy ? `${formatTokens(view.locked)} / ${formatTokens(view.liquid)}` : "—"],
    [r.fees, `${feeLabel(l, form.crew)} / ${feeLabel(l, form.creator)} / 1.0%`],
    [l.economics.total, bpsText(view.totalBps)],
    [l.steps.agent, agentLabel(l, form)],
    [l.summary.fee, eth(settings.launchFee)],
  ];
  const close = () => {
    setChecked(false);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={r.title} subtitle={r.sub} busy={working}>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg p-4">
        <span aria-hidden="true" className={`${LETTER_TILE} h-[47px] w-[43px] rounded-[10px] text-[29px]`}>
          {tokenLetter(form)}
        </span>
        <div className="min-w-0">
          <h3 className="m-0 font-display text-[20px] leading-6 font-extrabold [overflow-wrap:anywhere]">{form.name.trim()}</h3>
          <span className="mt-0.5 block font-mono text-[11px] text-text-3">
            {pairText(form.ticker)} · {chainName}
          </span>
        </div>
      </div>
      <dl className="m-0 flex flex-col gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-[12px]">
            <dt className="text-text-3">{label}</dt>
            <dd className="m-0 max-w-[62%] text-right font-mono leading-[1.6] [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
        <span className="text-[13px] font-medium">{r.total}</span>
        <div className="text-right">
          <strong className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.04em] whitespace-nowrap">{eth(view.payNow)}</strong>
          <small className="mt-0.5 block font-mono text-[10px] text-text-3">{l.summary.gas}</small>
        </div>
      </div>
      <p className="m-0 rounded-lg bg-raised p-3 text-[11px] leading-[1.8] text-text-2">{r.rules}</p>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-2">
        <input type="checkbox" checked={checked} disabled={working} onChange={(event) => setChecked(event.target.checked)} className="size-4 flex-none accent-cta" />
        {r.ack}
      </label>
      <div role="status" aria-live="polite" className="min-h-5 text-[12px]">
        {working ? (
          <span className="inline-flex items-center gap-2 text-text-2">
            <LoaderCircle size={14} strokeWidth={2} className="tk-spin" aria-hidden="true" />
            {run.step === "preparing" ? l.run.preparing : l.run.sign}
          </span>
        ) : run.step === "failed" ? (
          <span className="inline-flex items-start gap-2 text-neg">
            <TriangleAlert size={14} strokeWidth={2.2} className="mt-0.5 flex-none" aria-hidden="true" />
            <span>
              {l.run.failed}. {errors[run.error ?? ""] ?? l.run.unavailable}
            </span>
          </span>
        ) : run.changed ? (
          <span className="text-warn">{r.changed}</span>
        ) : (
          <span className="text-text-3">{note}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={working || !checked}
        className={cn(
          "inline-flex min-h-11 items-center justify-between gap-2 rounded-lg px-4 text-[13px] font-semibold",
          working || !checked ? "cursor-not-allowed border border-line-strong bg-input text-text-2" : "bg-cta text-on-cta hover:brightness-110",
        )}
      >
        {run.step === "failed" ? t.swap.tryAgain : fmt(r.confirm, { ticker })}
        {working ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin" aria-hidden="true" /> : <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
      </button>
    </Sheet>
  );
}
