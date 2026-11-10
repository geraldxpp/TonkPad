import { Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatChange, formatUsdCompact } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { TokenAvatar } from "@/shared/ui/TokenAvatar";
import type { RankedToken } from "../lib/filter";
import type { Timeframe } from "../lib/view";
import { tokenWindow } from "../lib/window";
import { OpenToken } from "./TokenRow";

/** Phone list columns: Token, Market cap, 24h, Open. */
export const COMPACT_GRID = "grid grid-cols-[minmax(0,1fr)_58px_64px_28px] items-center gap-1";

/** One token on the phone list: art, name and ticker, market cap, change and the open arrow. */
export function TokenRowCompact({ token, tf }: { token: RankedToken; tf: Timeframe }) {
  const { t, href } = useI18n();
  const { change } = tokenWindow(token, tf);
  const up = change >= 0;
  return (
    <div
      role="row"
      className={cn(COMPACT_GRID, "tk-row h-[70px] border-b border-line/65 px-3 last:border-b-0 hover:bg-raised max-[374px]:px-2")}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <TokenAvatar art={token.art} label={token.ticker} pad={token.launchpad} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <Link href={href(`/token/${token.address}`)} className="truncate text-[14px] font-semibold text-text hover:text-accent-text">
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
            {token.issuer ? (
              <span
                title={fmt(t.badges.rwaTitle, { issuer: token.issuer })}
                className="inline-flex size-[18px] flex-none items-center justify-center rounded-md border border-accent/38 bg-accent/14 text-accent-text"
              >
                <ShieldCheck size={10} strokeWidth={2.8} role="img" aria-label={t.badges.rwa} />
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-text-3">
            <ChainMark chain={token.chain} size={10} />
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
        {formatChange(change)}
      </span>
      <div role="cell" className="flex justify-end">
        <OpenToken address={token.address} ticker={token.ticker} small />
      </div>
    </div>
  );
}
