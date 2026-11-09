"use client";

import { ExternalLink } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd, formatUsdCompact } from "@/shared/lib/format";
import type { TokenTrade } from "@/shared/types/token-detail";
import { safeUrl } from "../../lib/display";
import { formatAmount, formatCoin, formatSeconds } from "../../lib/format";
import { WalletCell } from "./WalletCell";

const GRID = "grid grid-cols-[72px_64px_minmax(80px,1fr)_80px_84px_76px_minmax(220px,2fr)_40px] items-center px-5";
const NUM = "text-right font-mono text-[12px]";

interface TradesTableProps {
  trades: readonly TokenTrade[];
  coin: string;
  ticker: string;
}

/** Live trades: time, side, USD, coin, tokens, market cap, trader and the transaction link. */
export function TradesTable({ trades, coin, ticker }: TradesTableProps) {
  const { t } = useI18n();
  const h = t.token.trades;
  return (
    <div role="table" aria-label={h.label} className="min-w-[760px]">
      <div role="row" className={cn(GRID, "h-9 border-b border-line text-[12px] text-text-3")}>
        <span role="columnheader">{h.time}</span>
        <span role="columnheader">{h.type}</span>
        <span role="columnheader" className="text-right">{h.usd}</span>
        <span role="columnheader" className="text-right">{coin}</span>
        <span role="columnheader" className="text-right">{ticker}</span>
        <span role="columnheader" className="text-right">{h.mcap}</span>
        <span role="columnheader" className="pl-7">{h.trader}</span>
        <span role="columnheader" className="text-right">{h.tx}</span>
      </div>
      {trades.map((trade) => {
        const buy = trade.side === "buy";
        const tx = safeUrl(trade.txUrl);
        return (
          <div key={trade.id} role="row" className={cn(GRID, "h-11 hover:bg-raised")}>
            <span role="cell" className="font-mono text-[12px] text-text-3">{fmt(h.ago, { time: formatSeconds(trade.ageSeconds) })}</span>
            <span role="cell">
              <span className={cn("inline-block rounded-md px-2 py-0.5 text-[12px] font-semibold", buy ? "bg-pos/12 text-pos" : "bg-neg/12 text-neg")}>
                {buy ? h.buy : h.sell}
              </span>
            </span>
            <span role="cell" className={cn(NUM, "font-semibold", buy ? "text-pos" : "text-neg")}>{formatUsd(trade.usd)}</span>
            <span role="cell" className={cn(NUM, "text-text-2")}>{formatCoin(trade.native)}</span>
            <span role="cell" className={cn(NUM, "text-text-2")}>{formatAmount(trade.tokens)}</span>
            <span role="cell" className={cn(NUM, "text-text-3")}>{formatUsdCompact(trade.marketCap)}</span>
            <WalletCell address={trade.trader} tag={trade.tag} className="pl-7" />
            <span role="cell" className="flex justify-end text-text-3">
              {tx ? (
                <a href={tx} target="_blank" rel="noopener noreferrer" aria-label={h.viewTx} title={h.viewTx} className="hover:text-text">
                  <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                </a>
              ) : (
                <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
