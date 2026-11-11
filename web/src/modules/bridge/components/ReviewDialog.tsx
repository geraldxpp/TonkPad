"use client";

import { ArrowDown, ArrowRight, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import { Sheet } from "@/shared/ui/Sheet";
import type { RunState } from "../hooks/useBridgeRun";
import type { BridgeAsset, BridgeNetwork } from "../lib/networks";
import type { BridgeRoute } from "../lib/types";
import { amountOut, etaText, totalCost } from "../lib/view";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  from: BridgeNetwork;
  to: BridgeNetwork;
  asset: BridgeAsset;
  receive: BridgeAsset;
  /** The amount being sent, as typed. */
  amount: string;
  route: BridgeRoute | null;
  recipient: string | null;
  /** It's going somewhere other than the person's own wallet. */
  custom: boolean;
  run: RunState;
  onConfirm: () => void;
}

const WORKING = new Set(["preparing", "approve", "approving", "sign", "sending"]);
const usd = (value: number | null) => (value === null ? "—" : value > 0 && value < 0.01 ? "<$0.01" : formatUsd(value));

/**
 * "Check your destination.": both amounts, the full address, the time, the
 * fees and the least that can arrive, then Confirm. While it runs it says
 * what the wallet is being asked for; it ends in the transfer's progress, or
 * in the reason it didn't go.
 */
export function ReviewDialog({ open, onClose, from, to, asset, receive, amount, route, recipient, custom, run, onConfirm }: ReviewDialogProps) {
  const { t } = useI18n();
  const b = t.bridge;
  const r = b.review;
  const working = WORKING.has(run.step);
  const stepText: Record<string, string> = {
    preparing: b.steps.preparing,
    approve: fmt(b.steps.approve, { symbol: asset.symbol }),
    approving: fmt(b.steps.approving, { symbol: asset.symbol }),
    sign: fmt(b.steps.sign, { network: from.name }),
    sending: b.steps.sending,
  };
  const errorText = run.error ? ((b.errors as Record<string, string>)[run.error] ?? b.errors.unavailable) : null;
  const rows: [string, string][] = route
    ? [
        [r.delivery, etaText(b, route.etaSeconds)],
        [r.fees, usd(totalCost(route))],
        [r.minimum, `${amountOut(route.minOut, receive)} ${receive.symbol}`],
        [r.route, route.name],
        ...(route.gasTopUp ? [[r.gas, `${amountOut(route.gasTopUp.raw, to.assets[0])} ${to.assets[0].symbol}`] as [string, string]] : []),
      ]
    : [];
  return (
    <Sheet open={open} onClose={onClose} busy={working} title={r.title} subtitle={`${from.name} → ${to.name}`}>
      <div className="rounded-[11px] border border-line bg-bg p-[17px] max-[599px]:p-[15px]">
        <span className="mb-[5px] block text-[11px] text-text-3">{fmt(r.send, { network: from.name })}</span>
        <strong className="block font-mono text-[24px] font-medium tracking-[-0.9px] [overflow-wrap:anywhere]">
          {amount} {asset.symbol}
        </strong>
        <ArrowDown size={16} strokeWidth={2} className="my-3.5 text-accent" aria-hidden="true" />
        <span className="mb-[5px] block text-[11px] text-text-3">{fmt(r.receive, { network: to.name })}</span>
        <strong className="block font-mono text-[24px] font-medium tracking-[-0.9px] [overflow-wrap:anywhere]">
          {route ? amountOut(route.outAmount, receive) : "—"} {receive.symbol}
        </strong>
      </div>
      <div className="rounded-lg border border-line bg-raised p-3">
        <span className="mb-[5px] block text-[10px] text-text-3">{r.address}</span>
        <strong data-testid="bridge-review-recipient" className="block font-mono text-[11px] leading-[1.7] font-normal [overflow-wrap:anywhere]">
          {recipient ?? "—"}
        </strong>
      </div>
      {rows.length ? (
        <dl className="m-0">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-[15px] py-[5px] text-[12px]">
              <dt className="text-text-3">{label}</dt>
              <dd className="m-0 text-right font-mono text-[11px] [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {custom ? (
        <p className="m-0 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 p-3 text-[11px] leading-[1.7] text-warn">
          <TriangleAlert size={13} strokeWidth={2.1} className="mt-0.5 flex-none" aria-hidden="true" />
          <span>{fmt(r.anotherWarning, { network: to.name })}</span>
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-lg bg-raised p-3 text-[11px] leading-[1.7] text-text-3">
        {working ? <LoaderCircle size={13} strokeWidth={2} className="tk-spin mt-0.5 flex-none" aria-hidden="true" /> : run.step === "failed" ? <TriangleAlert size={13} strokeWidth={2.1} className="mt-0.5 flex-none text-neg" aria-hidden="true" /> : <Info size={13} strokeWidth={2} className="mt-0.5 flex-none" aria-hidden="true" />}
        <span className={cn(run.step === "failed" && "text-neg", working && "text-text-2")}>{working ? stepText[run.step] : run.step === "failed" ? errorText : r.notice}</span>
      </div>
      <button type="button" onClick={onConfirm} disabled={working || !route} className={cn("inline-flex min-h-12 items-center justify-between gap-2 rounded-lg px-4 text-[13px] font-semibold", working || !route ? "cursor-not-allowed border border-line-strong bg-input text-text-2" : "bg-cta text-on-cta hover:brightness-110")}>
        {run.step === "failed" ? r.tryAgain : r.confirm}
        {working ? <LoaderCircle size={16} strokeWidth={2} className="tk-spin" aria-hidden="true" /> : <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
      </button>
    </Sheet>
  );
}
