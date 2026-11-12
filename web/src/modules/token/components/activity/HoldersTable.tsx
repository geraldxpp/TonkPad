"use client";

import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatUsd } from "@/shared/lib/format";
import type { TokenHolder } from "@/shared/types/token-detail";
import { formatHolding } from "../../lib/format";
import { WalletCell } from "./WalletCell";

const GRID = "grid grid-cols-[40px_minmax(240px,2fr)_90px_90px_minmax(120px,1fr)] items-center px-5";
const NUM = "text-right font-mono text-[12px]";

/** Each row's rank: the counted holders in order; a labelled system holder has none. */
function ranks(holders: readonly TokenHolder[]): Array<number | null> {
  let rank = 0;
  return holders.map((holder) => (holder.label ? null : ++rank));
}

/**
 * The largest holders: rank, wallet, share of supply, balance and the crew
 * rewards each has earned. A tonkfun.fun launch's system holders (its curve,
 * the creator's lock, its pool) are labelled and carry no rank: they aren't
 * counted as holders.
 */
export function HoldersTable({ holders, ticker }: { holders: readonly TokenHolder[]; ticker: string }) {
  const { t } = useI18n();
  const h = t.token.holders;
  const rank = ranks(holders);
  return (
    <div role="table" aria-label={h.label} className="min-w-[760px]">
      <div role="row" className={cn(GRID, "h-9 border-b border-line text-[11px] text-text-3")}>
        <span role="columnheader">{h.rank}</span>
        <span role="columnheader">{h.holder}</span>
        <span role="columnheader" className="text-right">{h.supply}</span>
        <span role="columnheader" className="text-right">{ticker}</span>
        <span role="columnheader" className="text-right">{h.crew}</span>
      </div>
      {holders.map((holder, i) => (
        <div key={`${holder.label ?? ""}:${holder.address ?? "curve"}`} role="row" className={cn(GRID, "h-11 border-b border-line/65 last:border-b-0 hover:bg-raised")}>
          <span role="cell" title={rank[i] === null ? h.system : undefined} className="font-mono text-[12px] text-text-3">
            {rank[i] ?? "—"}
          </span>
          <WalletCell address={holder.address} label={holder.label} tag={holder.tag} />
          <span role="cell" className={cn(NUM, "font-semibold")}>{(holder.share * 100).toFixed(1)}%</span>
          <span role="cell" className={cn(NUM, "text-text-2")}>{formatHolding(holder.tokens)}</span>
          <span role="cell" className={cn(NUM, "font-semibold", holder.crewEarned === null ? "text-text-3" : "text-gold")}>
            {holder.crewEarned === null ? "—" : formatUsd(holder.crewEarned)}
          </span>
        </div>
      ))}
    </div>
  );
}
