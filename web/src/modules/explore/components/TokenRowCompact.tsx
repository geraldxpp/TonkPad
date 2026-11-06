import { Lock, Zap } from "lucide-react";
import Link from "next/link";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatChange, formatUsdCompact } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { TokenAvatar } from "@/shared/ui/TokenAvatar";
import type { RankedToken } from "../lib/filter";

/** Phone list columns: Token, Market cap, 24h, Quick buy. */
export const COMPACT_GRID = "grid grid-cols-[minmax(0,1fr)_56px_60px_32px] items-center gap-1";

/** One token on the phone list: art, name and ticker, market cap, change and a round quick-buy. */
export function TokenRowCompact({ token }: { token: RankedToken }) {
  const { t, href } = useI18n();
  const up = token.change24h >= 0;
  const quick = CHAINS[token.chain].quickBuy;
  return (
    <div
      role="row"
      className={cn(COMPACT_GRID, "tk-row min-h-[60px] rounded-[14px] px-2 py-2 hover:bg-raised max-[374px]:px-1")}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <TokenAvatar art={token.art} pad={token.launchpad} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <Link href={href(`/token/${token.ticker}`)} className="truncate text-[14px] font-semibold text-text">
              {token.name}
            </Link>
            {token.flags.hot ? <Badge kind="hot" /> : null}
            {token.flags.locked ? (
              <span
                title={t.badges.locked}
                className="inline-flex size-[18px] flex-none items-center justify-center rounded-md border border-locked/38 bg-locked/14 text-locked"
              >
                <Lock size={10} strokeWidth={2.8} role="img" aria-label={t.badges.locked} />
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-text-3">
            <ChainMark chain={token.chain} size={8} />
            <span className="truncate">{token.ticker}</span>
            <span aria-hidden="true">·</span>
            <span className="flex-none">{formatAge(token.ageMinutes)}</span>
          </span>
        </span>
      </div>
      <span role="cell" className="text-right font-mono text-[13px] font-semibold">
        {formatUsdCompact(token.marketCap)}
      </span>
      <span role="cell" className={cn("text-right font-mono text-[13px] font-semibold", up ? "text-pos" : "text-neg")}>
        {formatChange(token.change24h)}
      </span>
      <div role="cell" className="flex justify-end">
        <button
          type="button"
          aria-label={fmt(t.table.quickBuyLabel, { amount: quick.amount, unit: quick.unit, ticker: token.ticker })}
          title={fmt(t.table.quickBuyTitle, { amount: quick.amount, unit: quick.unit })}
          className="inline-flex size-8 items-center justify-center rounded-full border border-accent/45 bg-accent/14 text-accent-text"
        >
          <Zap size={14} fill="currentColor" stroke="none" />
        </button>
      </div>
    </div>
  );
}
