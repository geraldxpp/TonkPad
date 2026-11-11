"use client";

import { ArrowUpRight, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatEth, formatTokensFull } from "@/shared/tonk/format";
import type { MissionJson } from "@/shared/tonk/mission";
import { explorerTxUrl, type TonkNetwork } from "@/shared/tonk/networks";
import type { PoolQuoteJson } from "@/shared/tonk/pool";
import { Sheet } from "@/shared/ui/Sheet";
import type { PoolRunState } from "../../hooks/usePoolRun";
import { bpsPct, runError } from "../../lib/curve-text";

interface PoolReviewProps {
  open: boolean;
  onClose: () => void;
  mission: MissionJson;
  network: TonkNetwork;
  quote: PoolQuoteJson | null;
  /** The least the trader accepts after slippage, in wei, on the quote shown (the fresh one once the pool has moved). */
  minOut: bigint | null;
  run: PoolRunState;
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

const BPS = BigInt(10_000);

/**
 * "One last look." before a trade on a graduated token's Uniswap pool: what
 * goes in, what comes out by Uniswap's own quote and the least the swap may
 * deliver, the pool's fee and the route. Then the steps, each named as it
 * happens.
 */
export function PoolReview({ open, onClose, mission, network, quote, minOut, run, onConfirm }: PoolReviewProps) {
  const { t } = useI18n();
  const m = t.mission.trade;
  const unit = network.unit;
  const ticker = mission.symbol;
  const shown = run.moved ?? quote;
  const working = run.step !== "idle" && run.step !== "failed";
  const coin = (wei: bigint) => `${formatEth(wei)} ${unit}`;
  const tokens = (wei: bigint) => `${formatTokensFull(wei)} $${ticker}`;
  const buy = shown?.side === "buy";
  const progress: Record<string, string | null> = {
    preparing: m.preparing,
    approve: fmt(t.swap.steps.approve, { symbol: ticker }),
    approving: fmt(t.swap.steps.approving, { symbol: ticker }),
    allow: fmt(m.allow, { ticker }),
    allowing: m.allowing,
    sign: m.sign,
  };
  const step = progress[run.step] ?? null;
  // An approval confirming for a long while: said so, and the watch can be stopped (the approval is left to the wallet).
  const stalled = (run.step === "approving" || run.step === "allowing") && run.stalled;
  return (
    <Sheet open={open} onClose={onClose} title={t.swap.reviewTitle} subtitle={m.poolReviewSub} busy={working}>
      {shown ? (
        <dl className="m-0 flex flex-col gap-2 rounded-xl border border-line bg-bg p-4">
          <Row label={buy ? t.token.trade.pay : t.token.trade.sellAmount} strong>
            {buy ? coin(BigInt(shown.amountIn)) : tokens(BigInt(shown.amountIn))}
          </Row>
          <Row label={t.swap.receiveEstimated} strong>
            {buy ? tokens(BigInt(shown.out)) : coin(BigInt(shown.out))}
          </Row>
          {minOut !== null ? <Row label={t.swap.minReceived}>{buy ? tokens(minOut) : coin(minOut)}</Row> : null}
          <Row label={`${m.poolFee} · ${bpsPct(shown.feeBps)}`}>
            {buy ? coin((BigInt(shown.amountIn) * BigInt(shown.feeBps)) / BPS) : tokens((BigInt(shown.amountIn) * BigInt(shown.feeBps)) / BPS)}
          </Row>
          <Row label={m.route}>Uniswap v4</Row>
        </dl>
      ) : null}
      {shown && !buy ? <p className="m-0 text-[12px] leading-[1.6] text-text-2">{fmt(m.poolApproveFirst, { amount: formatTokensFull(BigInt(shown.amountIn)), ticker })}</p> : null}
      {run.moved ? (
        <p role="alert" className="m-0 rounded-lg border border-accent/20 bg-accent/6 px-3.5 py-3 text-[12px] leading-[1.6] text-accent-text">
          {m.moved}
        </p>
      ) : null}
      <div role="status" aria-live="polite" className="flex flex-col gap-1.5 empty:hidden">
        {step ? (
          <p className="m-0 flex items-center gap-2 text-[13px] text-text-2">
            <LoaderCircle size={15} strokeWidth={2} className="tk-spin flex-none text-accent-text" aria-hidden="true" />
            {step}
          </p>
        ) : null}
        {stalled ? <p className="m-0 text-[12px] leading-[1.6] text-text-2">{m.stalled}</p> : null}
        {run.approval ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={explorerTxUrl(network, run.approval)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-[12px] font-semibold text-accent-text">
              {t.swap.viewTx}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
            </a>
            {stalled ? (
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
      <button type="button" onClick={onConfirm} disabled={working || !shown} className="min-h-11 rounded-lg bg-cta px-4 text-[14px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-60">
        {run.step === "failed" ? t.swap.tryAgain : fmt(buy ? m.confirmBuy : m.confirmSell, { ticker })}
      </button>
    </Sheet>
  );
}
