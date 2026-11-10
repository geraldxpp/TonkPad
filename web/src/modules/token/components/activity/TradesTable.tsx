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

/** Trader, type, USD, coin, tokens, market cap, time and the transaction; phones keep trader, type, USD and time. */
const GRID = cn(
  "grid items-center px-5 max-md:px-3.5",
  "grid-cols-[minmax(0,1fr)_52px_78px_56px] gap-x-2",
  "md:grid-cols-[minmax(200px,2fr)_64px_minmax(84px,1fr)_76px_80px_76px_76px_28px] md:gap-x-0",
);
const NUM = "text-right font-mono text-[12px]";
const WIDE = "max-md:hidden";

interface TradesTableProps {
  trades: readonly TokenTrade[];
  coin: string;
  ticker: string;
}

/** Live trades: who traded, buy or sell, the size, the market cap after it, when, and the transaction link. */
export function TradesTable({ trades, coin, ticker }: TradesTableProps) {
  const { t } = useI18n();
  const h = t.token.trades;
  return (
    <div role="table" aria-label={h.label} className="md:min-w-[760px]">
      <div role="row" className={cn(GRID, "h-9 border-b border-line text-[11px] text-text-3")}>
        <span role="columnheader">{h.trader}</span>
        <span role="columnheader">{h.type}</span>
        <span role="columnheader" className="text-right">{h.usd}</span>
        <span role="columnheader" className={cn("text-right", WIDE)}>{coin}</span>
        <span role="columnheader" className={cn("truncate text-right", WIDE)}>{ticker}</span>
        <span role="columnheader" className={cn("text-right", WIDE)}>{h.mcap}</span>
        <span role="columnheader" className="text-right">{h.time}</span>
        <span role="columnheader" className={cn("text-right", WIDE)}>
          <span className="sr-only">{h.tx}</span>
        </span>
      </div>
      {trades.map((trade) => {
        const buy = trade.side === "buy";
        const tx = safeUrl(trade.txUrl);
        return (
          <div key={trade.id} role="row" className={cn(GRID, "h-11 border-b border-line/65 last:border-b-0 hover:bg-raised")}>
            <WalletCell address={trade.trader} tag={trade.tag} />
            <span role="cell">
              <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold", buy ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg")}>
                {buy ? h.buy : h.sell}
              </span>
            </span>
            <span role="cell" className={cn(NUM, "text-text")}>{trade.usd === null ? "—" : formatUsd(trade.usd)}</span>
            <span role="cell" className={cn(NUM, "text-text-2", WIDE)}>{trade.native === null ? "—" : formatCoin(trade.native)}</span>
            <span role="cell" className={cn(NUM, "text-text-2", WIDE)}>{formatAmount(trade.tokens)}</span>
            <span role="cell" className={cn(NUM, "text-text-3", WIDE)}>{trade.marketCap === null ? "—" : formatUsdCompact(trade.marketCap)}</span>
            <span role="cell" className={cn(NUM, "text-text-3")}>{fmt(h.ago, { time: formatSeconds(trade.ageSeconds) })}</span>
            <span role="cell" className={cn("flex justify-end text-text-3", WIDE)}>
              {tx ? (
                <a href={tx} target="_blank" rel="noopener noreferrer" aria-label={h.viewTx} title={h.viewTx} className="rounded hover:text-text">
                  <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                </a>
              ) : (
                <ExternalLink size={13} strokeWidth={2} aria-hidden="true" className="opacity-40" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
