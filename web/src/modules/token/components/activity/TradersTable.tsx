"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import type { TopTrader } from "@/shared/types/token-detail";
import { WalletCell } from "./WalletCell";

const GRID = "grid grid-cols-[minmax(240px,2fr)_110px_100px_100px_90px] items-center px-5";
const NUM = "text-right font-mono text-[12px]";

/** "+$4,812", "−$64" */
const signedUsd = (value: number) => `${value < 0 ? "−" : "+"}${formatUsd(Math.abs(value), 0)}`;

/** The most profitable wallets in this token: realised PnL, what they bought and sold, and their win rate. */
export function TradersTable({ traders }: { traders: readonly TopTrader[] }) {
  const { t } = useI18n();
  const h = t.token.traders;
  return (
    <div role="table" aria-label={h.label} className="min-w-[760px]">
      <div role="row" className={cn(GRID, "h-9 border-b border-line text-[11px] text-text-3")}>
        <span role="columnheader">{h.trader}</span>
        <span role="columnheader" className="text-right">{h.pnl}</span>
        <span role="columnheader" className="text-right">{h.bought}</span>
        <span role="columnheader" className="text-right">{h.sold}</span>
        <span role="columnheader" className="text-right">{h.win}</span>
      </div>
      {traders.map((trader) => (
        <div key={trader.address} role="row" className={cn(GRID, "h-11 border-b border-line/65 last:border-b-0 hover:bg-raised")}>
          <WalletCell address={trader.address} tag={trader.tag} />
          <span role="cell" className={cn(NUM, "font-semibold", trader.pnlUsd < 0 ? "text-neg" : "text-pos")}>{signedUsd(trader.pnlUsd)}</span>
          <span role="cell" className={cn(NUM, "text-text-2")}>{formatUsd(trader.boughtUsd, 0)}</span>
          <span role="cell" className={cn(NUM, "text-text-2")}>{formatUsd(trader.soldUsd, 0)}</span>
          <span role="cell" className={cn(NUM, "font-semibold")}>{trader.winRate === null ? "—" : `${Math.round(trader.winRate * 100)}%`}</span>
        </div>
      ))}
    </div>
  );
}
