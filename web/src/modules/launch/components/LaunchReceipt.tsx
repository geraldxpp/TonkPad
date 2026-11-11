"use client";

import { ArrowUpRight, Check, Copy, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatEth, formatTokens } from "@/shared/tonk/format";
import type { LaunchTxView } from "../hooks/useLaunchTx";

interface LaunchReceiptProps {
  hash: string;
  tx: LaunchTxView;
  chainName: string;
  unit: string;
  explorerUrl: string | null;
  /** Where the launched token's own page is, on a site that has one (the testnet site). */
  tokenHref?: (token: string) => string;
  /** Leaves the receipt: back to the form after a failure, or to a fresh one after a launch. */
  onBack: (launched: boolean) => void;
}

const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-raised px-4 text-[13px] font-semibold hover:bg-input";

/**
 * What became of a launch's transaction, read from the chain by its hash:
 * confirming, launched (with the mission's own figures), failed, or replaced
 * in the wallet. A hash alone is never shown as a launch.
 */
export function LaunchReceipt({ hash, tx, chainName, unit, explorerUrl, tokenHref, onBack }: LaunchReceiptProps) {
  const { t } = useI18n();
  const l = t.launch;
  const c = l.receipt;
  const [copied, setCopied] = useState(false);
  const mission = tx.state === "confirmed" ? tx.mission : null;
  const waiting = tx.state === "checking" || tx.state === "pending" || tx.state === "unknown";
  const link = (path: string, label: string) =>
    explorerUrl ? (
      <a href={`${explorerUrl}${path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-[13px] font-semibold text-accent-text">
        {label}
        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
      </a>
    ) : null;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };
  const tokens = (wei: string) => formatTokens(BigInt(wei));
  let icon: ReactNode = <LoaderCircle size={22} strokeWidth={2} className="tk-spin text-accent-text" aria-hidden="true" />;
  let title = c.pendingTitle;
  let body: string = tx.stalled ? l.run.stalled : c.pendingBody;
  if (mission) {
    icon = <Check size={22} strokeWidth={2.6} className="text-pos" aria-hidden="true" />;
    title = c.title;
    body = fmt(c.sub, { name: mission.name, chain: chainName });
  } else if (!waiting) {
    icon = <TriangleAlert size={22} strokeWidth={2.2} className="text-neg" aria-hidden="true" />;
    title = l.run.failed;
    body = tx.state === "failed" ? l.run.reverted : tx.state === "replaced" || tx.replacedBy ? l.run.replaced : c.notLaunch;
  }
  return (
    <section aria-labelledby="launch-receipt-title" className="mx-auto flex w-full max-w-[560px] flex-col gap-5 rounded-2xl border border-line bg-surface p-6 max-md:p-4">
      <div role="status" aria-live="polite" className="flex items-start gap-3.5">
        <span className={cn("flex size-11 flex-none items-center justify-center rounded-xl border", mission ? "border-pos/25 bg-pos/8" : waiting ? "border-accent/20 bg-accent/6" : "border-neg/25 bg-neg/8")}>{icon}</span>
        <div className="min-w-0">
          <h1 id="launch-receipt-title" className="font-display text-[26px] leading-8 font-extrabold tracking-[-0.03em]">
            {title}
          </h1>
          <p className="m-0 mt-1 text-[13px] leading-[1.7] text-text-2">{body}</p>
          {tx.unreachable && waiting ? <p className="m-0 mt-1 text-[12px] text-warn">{l.run.unavailable}</p> : null}
        </div>
      </div>
      {mission ? (
        <>
          <div className="rounded-xl border border-line bg-bg p-4">
            <span className="text-[11px] text-text-3">{c.token}</span>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-auto font-mono text-[13px] [overflow-wrap:anywhere]">{mission.token}</code>
              <button type="button" onClick={() => void copy(mission.token)} aria-label={t.wallet.copy} className="inline-flex size-9 flex-none items-center justify-center rounded-lg border border-line-strong bg-raised hover:bg-input">
                {copied ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
            </div>
            <span aria-live="polite" className="sr-only">
              {copied ? t.wallet.copied : ""}
            </span>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 text-[12px]">
            {(
              [
                [c.bought, `${tokens(mission.bought)} $${mission.symbol}`],
                [l.lock.locked, tokens(mission.locked)],
                [c.liquid, formatTokens(BigInt(mission.bought) - BigInt(mission.locked))],
                [l.summary.devBuy, `${formatEth(BigInt(mission.devBuy))} ${unit}`],
                [c.fees, `${formatEth(BigInt(mission.protocolFee) + BigInt(mission.creatorFee))} ${unit}`],
                [l.review.fees, `${(mission.crewBps / 100).toFixed(1)}% / ${(mission.creatorBps / 100).toFixed(1)}% / 1.0%`],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-text-3">{label}</dt>
                <dd className="m-0 mt-1 font-mono text-[14px] [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-4">
        {link(`/tx/${tx.replacedBy ?? hash}`, t.swap.viewTx)}
        {mission ? link(`/address/${mission.token}`, c.viewToken) : null}
        <span className="flex-auto" />
        {mission && tokenHref ? (
          <Link href={tokenHref(mission.token)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cta px-4 text-[13px] font-semibold text-on-cta shadow-cta hover:brightness-110">
            {t.mission.find.openPage}
          </Link>
        ) : null}
        {waiting ? null : (
          <button type="button" onClick={() => onBack(mission !== null)} className={BUTTON}>
            {mission ? c.again : c.backToStudio}
          </button>
        )}
      </div>
    </section>
  );
}
