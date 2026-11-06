import { Zap } from "lucide-react";
import Link from "next/link";
import { CHAINS } from "@/shared/config/chains";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatChange, formatInteger, formatUsdCompact } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { CurveBar } from "@/shared/ui/CurveBar";
import { ScorePill } from "@/shared/ui/ScorePill";
import { Sparkline } from "@/shared/ui/Sparkline";
import { TokenAvatar } from "@/shared/ui/TokenAvatar";
import type { RankedToken } from "../lib/filter";

/**
 * Columns: #, Token, Bonding curve, Mission score, Last 24h, 24h, Volume,
 * Holders, Smart money, Market cap, Quick buy. All 11 show from 1440 px; below
 * that the lower-priority ones drop out so the table never scrolls sideways
 * and Market cap and Quick buy stay on screen.
 */
export const TABLE_GRID = cn(
  "grid items-center grid-cols-[32px_minmax(240px,1fr)_86px_96px_72px]",
  "lg:grid-cols-[32px_minmax(300px,1fr)_84px_104px_86px_96px_72px]",
  "xl:grid-cols-[32px_minmax(340px,1fr)_120px_84px_104px_86px_88px_96px_72px]",
  "wide:grid-cols-[32px_minmax(380px,1fr)_120px_84px_104px_86px_88px_72px_92px_96px_72px]",
);

/** When each optional column appears (keep in step with TABLE_GRID). */
export const COLUMN_VISIBILITY = {
  curve: "hidden xl:flex",
  score: "hidden lg:block",
  spark: "hidden lg:block",
  volume: "hidden xl:block",
  holders: "hidden wide:block",
  smart: "hidden wide:flex",
} as const;

const SMART = [
  "bg-[linear-gradient(135deg,#FF9A4D,#E2445E)]",
  "-ml-1.5 bg-[linear-gradient(135deg,#46D9F2,#2D48F0)]",
  "-ml-1.5 bg-[linear-gradient(135deg,#3BDB98,#0B5E50)]",
];

export function TokenRow({ token }: { token: RankedToken }) {
  const up = token.change24h >= 0;
  const { flags } = token;
  const quick = CHAINS[token.chain].quickBuy;
  return (
    <div role="row" className={cn(TABLE_GRID, "tk-row h-16 rounded-[14px] px-3 hover:bg-raised")}>
      <span role="cell" className="font-mono text-[12px] text-text-3">
        {token.rank}
      </span>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <TokenAvatar art={token.art} pad={token.launchpad} />
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="flex items-center gap-[5px] whitespace-nowrap">
            <Link href={`/token/${token.ticker}`} className="text-[14px] font-semibold text-text">
              {token.name}
            </Link>
            <span className="font-mono text-[12px] text-text-3">{token.ticker}</span>
            {flags.hot ? <Badge kind="hot" /> : null}
            {flags.og ? <Badge kind="og" density="compact" /> : null}
            {flags.isNew ? <Badge kind="new" density="compact" /> : null}
            {flags.locked ? <Badge kind="locked" density="compact" /> : null}
            {/* The narrower tiers keep the token line short. */}
            {flags.crew ? (
              <span className="max-lg:hidden">
                <Badge kind="crew" value={flags.crew} density="compact" />
              </span>
            ) : null}
            {flags.agent ? (
              <span className="max-xl:hidden">
                <Badge kind="agent" density="compact" />
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] whitespace-nowrap text-text-3">
            <ChainMark chain={token.chain} size={10} />
            by {token.creator} · {formatAge(token.ageMinutes)}
          </span>
        </span>
      </div>
      <div role="cell" className={cn(COLUMN_VISIBILITY.curve, "items-center gap-2")}>
        {token.curve < 1 ? (
          <>
            <CurveBar value={token.curve} className="h-1.5 w-[72px] flex-none" />
            <span className="font-mono text-[12px] font-semibold">{Math.round(token.curve * 100)}%</span>
          </>
        ) : (
          <Badge kind="graduated" />
        )}
      </div>
      <div role="cell" className={COLUMN_VISIBILITY.score}>
        <ScorePill score={token.score} level={token.level} />
      </div>
      <div role="cell" className={COLUMN_VISIBILITY.spark}>
        <Sparkline seed={token.spark} up={up} className="inline align-baseline" />
      </div>
      <span role="cell" className={cn("text-right font-mono text-[14px] font-semibold", up ? "text-pos" : "text-neg")}>
        {formatChange(token.change24h)}
      </span>
      <span role="cell" className={cn(COLUMN_VISIBILITY.volume, "text-right font-mono text-[14px] font-medium")}>
        {formatUsdCompact(token.volume24h, { trimZeros: true })}
      </span>
      <span role="cell" className={cn(COLUMN_VISIBILITY.holders, "text-right font-mono text-[14px] font-medium text-text-2")}>
        {formatInteger(token.holders)}
      </span>
      <div role="cell" className={cn(COLUMN_VISIBILITY.smart, "items-center gap-1.5 pl-[18px]")}>
        {token.smartWallets > 0 ? (
          <>
            <span className="inline-flex" aria-hidden="true">
              {SMART.map((tone) => (
                <span key={tone} className={cn("size-5 rounded-full shadow-[0_0_0_2px_var(--surface)]", tone)} />
              ))}
            </span>
            <span className="font-mono text-[12px] font-semibold text-cyan">+{token.smartWallets}</span>
          </>
        ) : (
          <span className="text-text-3">
            <span aria-hidden="true">—</span>
            <span className="sr-only">None</span>
          </span>
        )}
      </div>
      <span role="cell" className="text-right font-mono text-[14px] font-semibold">
        {formatUsdCompact(token.marketCap)}
      </span>
      <div role="cell" className="flex justify-end">
        <button
          type="button"
          aria-label={`Quick buy ${quick.amount} ${quick.unit} of ${token.ticker}`}
          className="inline-flex h-[30px] items-center gap-[5px] rounded-[9px] border border-accent/45 bg-accent/14 pr-2.5 pl-2 font-mono text-[12px] font-semibold text-accent-text"
        >
          <Zap size={13} fill="currentColor" stroke="none" />
          {quick.amount}
        </button>
      </div>
    </div>
  );
}
