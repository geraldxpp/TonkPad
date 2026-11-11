"use client";

import { ArrowUpRight, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { shortAddress } from "@/shared/lib/address";
import { cn } from "@/shared/lib/cn";
import { formatEth, formatTokensFull } from "@/shared/tonk/format";
import type { MissionJson, TradeQuoteJson } from "@/shared/tonk/mission";
import { explorerTxUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { Sheet } from "@/shared/ui/Sheet";
import type { CurveRunState } from "../../hooks/useCurveRun";
import { bpsPct, runError } from "../../lib/curve-text";

interface CurveReviewProps {
  open: boolean;
  onClose: () => void;
  mission: MissionJson;
  network: TonkNetwork;
  quote: TradeQuoteJson | null;
  /** The Crew fee this trade pays: none on a sale that leaves nobody eligible holding the token. */
  crewBps: number;
  /** A sell the launchpad may not yet take: the wallet approves exactly this amount first. */
  needsApproval: boolean;
  referrer: string | null;
  run: CurveRunState;
  onConfirm: () => void;
}

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px] leading-[1.6]">
      <dt className="flex-none text-text-3">{label}</dt>
      <dd className={cn("m-0 text-right font-mono [overflow-wrap:anywhere]", strong && "text-[15px] font-semibold")}>{children}</dd>
    </div>
  );
}

/**
 * "One last look." before a curve trade: what goes in, what comes out and
 * the least the contract may deliver, each fee, and anything unusual about
 * this trade. Then the steps, each named as it happens.
 */
export function CurveReview({ open, onClose, mission, network, quote, crewBps, needsApproval, referrer, run, onConfirm }: CurveReviewProps) {
  const { t } = useI18n();
  const m = t.mission.trade;
  const unit = network.unit;
  const ticker = mission.symbol;
  const working = run.step === "preparing" || run.step === "approve" || run.step === "approving" || run.step === "sign";
  const coin = (wei: string) => `${formatEth(BigInt(wei))} ${unit}`;
  const tokens = (wei: string) => `${formatTokensFull(BigInt(wei))} $${ticker}`;
  const buy = quote?.side === "buy";
  const progress =
    run.step === "preparing"
      ? m.preparing
      : run.step === "approve"
        ? fmt(t.swap.steps.approve, { symbol: ticker })
        : run.step === "approving"
          ? fmt(t.swap.steps.approving, { symbol: ticker })
          : run.step === "sign"
            ? m.sign
            : null;
  return (
    <Sheet open={open} onClose={onClose} title={t.swap.reviewTitle} subtitle={m.reviewSub} busy={working}>
      {quote ? (
        <dl className="m-0 flex flex-col gap-2 rounded-xl border border-line bg-bg p-4">
          <Row label={buy ? t.token.trade.pay : t.token.trade.sellAmount} strong>
            {buy ? coin(quote.amountIn) : tokens(quote.amountIn)}
          </Row>
          <Row label={t.swap.receiveEstimated} strong>
            {buy ? tokens(quote.out) : coin(quote.out)}
          </Row>
          <Row label={t.swap.minReceived}>{buy ? tokens(quote.minOut) : coin(quote.minOut)}</Row>
          <Row label={`${t.launch.summary.protocol} · ${bpsPct(100)}`}>{coin(quote.protocolFee)}</Row>
          <Row label={`${t.launch.economics.crewTitle} · ${bpsPct(crewBps)}`}>{coin(quote.crewFee)}</Row>
          <Row label={`${t.launch.economics.creatorTitle} · ${bpsPct(mission.creatorBps)}`}>{coin(quote.creatorFee)}</Row>
          {referrer ? <Row label={m.referral}>{fmt(m.referralValue, { address: shortAddress(referrer) })}</Row> : null}
        </dl>
      ) : null}
      {quote?.completesCurve ? (
        <p className="m-0 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/7 px-3.5 py-3 text-[12px] leading-[1.6] text-warn">
          <TriangleAlert size={15} strokeWidth={2.2} className="mt-0.5 flex-none" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{m.completes}</strong> {fmt(network.uniswap ? m.completesBodyPool : m.completesBody, { refund: coin(quote.refund) })}
          </span>
        </p>
      ) : null}
      {quote?.capped ? <p className="m-0 rounded-lg bg-warn/7 px-3.5 py-3 text-[12px] leading-[1.6] text-warn">{m.capped}</p> : null}
      {quote && !buy && needsApproval ? (
        <p className="m-0 text-[12px] leading-[1.6] text-text-2">{fmt(m.approveFirst, { amount: formatTokensFull(BigInt(quote.amountIn)), ticker })}</p>
      ) : null}
      {run.moved ? (
        <p role="alert" className="m-0 rounded-lg border border-accent/20 bg-accent/6 px-3.5 py-3 text-[12px] leading-[1.6] text-accent-text">
          {m.moved}
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="flex flex-col gap-1.5 empty:hidden">
        {progress ? (
          <p className="m-0 flex items-center gap-2 text-[13px] text-text-2">
            <LoaderCircle size={15} strokeWidth={2} className="tk-spin flex-none text-accent-text" aria-hidden="true" />
            {progress}
          </p>
        ) : null}
        {run.step === "approving" && run.stalled ? <p className="m-0 text-[12px] leading-[1.6] text-text-2">{m.stalled}</p> : null}
        {run.approval ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={explorerTxUrl(network, run.approval)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-[12px] font-semibold text-accent-text">
              {t.swap.viewTx}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
            </a>
            {run.step === "approving" && run.stalled ? (
              <button type="button" onClick={onClose} className="min-h-8 rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-semibold hover:bg-input">
                {m.stopWatching}
              </button>
            ) : null}
          </div>
        ) : null}
        {run.step === "failed" ? (
          <p role="alert" className="m-0 flex flex-col gap-0.5 rounded-lg border border-neg/25 bg-neg/7 px-3.5 py-3 text-[13px] leading-[1.6] text-neg">
            <strong className="font-semibold">{m.failedTitle}</strong>
            <span>{runError(t, run.error, unit)}</span>
          </p>
        ) : null}
      </div>
      <button type="button" onClick={onConfirm} disabled={working || !quote} className="min-h-11 rounded-lg bg-cta px-4 text-[14px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-60">
        {run.step === "failed" ? t.swap.tryAgain : fmt(buy ? m.confirmBuy : m.confirmSell, { ticker })}
      </button>
    </Sheet>
  );
}
