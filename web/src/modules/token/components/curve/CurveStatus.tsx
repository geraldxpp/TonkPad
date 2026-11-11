"use client";

import { ArrowUpRight, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatEth, formatTokens } from "@/shared/tonk/format";
import type { TxEventJson } from "@/shared/tonk/mission";
import type { TonkNetwork } from "@/shared/tonk/networks";
import { explorerTxUrl } from "@/shared/tonk/networks";
import type { SentTrade } from "../../hooks/useSentTrade";
import { runError } from "../../lib/curve-text";

interface CurveStatusProps {
  sent: SentTrade;
  token: string;
  ticker: string;
  network: TonkNetwork;
  /** A graduated token's pool id: its Swap is the trade to show. */
  pool?: string | null;
  onDismiss: () => void;
}

/** What a seller receives: the event's gross ETH less the three fees. */
const netOf = (trade: Extract<TxEventJson, { kind: "trade" }>) => BigInt(trade.eth) - BigInt(trade.protocolFee) - BigInt(trade.crewFee) - BigInt(trade.creatorFee);

/**
 * A sent trade, watched by its hash: confirming, then what the chain
 * recorded (the CurveTrade event's own amounts), or why it failed. A hash
 * alone is never success, and no slow or failed check is ever a failure:
 * a long wait only says so. If the wallet sent another transaction in its
 * place, that one's result and link are shown, and it counts only if it
 * traded this token.
 */
export function CurveStatus({ sent, token, ticker, network, pool = null, onDismiss }: CurveStatusProps) {
  const { t } = useI18n();
  const m = t.mission.trade;
  const { hash, tx, waiting } = sent;
  const trade = tx.events.find((event): event is Extract<TxEventJson, { kind: "trade" }> => event.kind === "trade" && event.token.toLowerCase() === token.toLowerCase());
  // On a graduated token, the swap on this token's own pool (never another pool's, whatever the link says).
  const swap = pool ? tx.events.find((event): event is Extract<TxEventJson, { kind: "pool" }> => event.kind === "pool" && event.pool.toLowerCase() === pool.toLowerCase()) : undefined;
  const graduated = tx.events.some((event) => event.kind === "graduated");
  let title = fmt(t.swap.steps.confirming, { chain: network.name });
  let body: string | null = tx.stalled ? m.stalled : tx.unreachable ? t.mission.stale : null;
  if (waiting && tx.stalled) title = m.stalledTitle;
  if (tx.state === "confirmed") {
    // A trade on the curve or a swap on this token's own pool: either is what this page sent, even from a replacement.
    const done = trade
      ? trade.side === "buy"
        ? fmt(m.doneBuy, { amount: formatTokens(BigInt(trade.tokens)), ticker })
        : fmt(m.doneSell, { amount: formatEth(netOf(trade)), unit: network.unit })
      : swap
        ? swap.side === "buy"
          ? fmt(m.doneBuy, { amount: formatTokens(BigInt(swap.tokens)), ticker })
          : fmt(m.doneSell, { amount: formatEth(BigInt(swap.eth)), unit: network.unit })
        : null;
    title = done ?? (tx.replacedBy ? m.failedTitle : m.errors.other);
    body = trade ? (graduated ? (network.uniswap ? m.graduatedPool : m.graduated) : null) : swap ? null : tx.replacedBy ? runError(t, "replaced", network.unit) : null;
  } else if (!waiting) {
    title = m.failedTitle;
    body = runError(t, tx.state === "failed" ? "reverted" : "replaced", network.unit);
  }
  const ok = tx.state === "confirmed" && (trade !== undefined || swap !== undefined);
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3.5">
      <div className="flex items-start gap-2.5">
        {waiting ? (
          <LoaderCircle size={17} strokeWidth={2} className="tk-spin mt-0.5 flex-none text-accent-text" aria-hidden="true" />
        ) : ok ? (
          <Check size={17} strokeWidth={2.6} className="mt-0.5 flex-none text-pos" aria-hidden="true" />
        ) : (
          <TriangleAlert size={17} strokeWidth={2.2} className="mt-0.5 flex-none text-neg" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-[13px] font-semibold [overflow-wrap:anywhere]">{title}</strong>
          {body ? <span className="text-[12px] leading-[1.6] text-text-2">{body}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={explorerTxUrl(network, tx.replacedBy ?? hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-[12px] font-semibold text-accent-text">
          {t.swap.viewTx}
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
        </a>
        {waiting && !tx.stalled ? null : (
          <button type="button" onClick={onDismiss} className="min-h-8 rounded-lg border border-line-strong bg-surface px-3 text-[12px] font-semibold hover:bg-input">
            {waiting ? m.stopWatching : t.swap.done}
          </button>
        )}
      </div>
    </div>
  );
}
