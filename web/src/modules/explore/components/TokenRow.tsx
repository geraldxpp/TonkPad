import { ArrowUpRight, GraduationCap, Users } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatChange, formatInteger, formatUsdCompact } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { CurveBar } from "@/shared/ui/CurveBar";
import { ScorePill } from "@/shared/ui/ScorePill";
import { Sparkline } from "@/shared/ui/Sparkline";
import { TokenAvatar } from "@/shared/ui/TokenAvatar";
import type { RankedToken } from "../lib/filter";
import type { Timeframe } from "../lib/view";
import { tokenWindow } from "../lib/window";

/**
 * Columns: #, Token, Bonding curve, Mission score, Last 24h, 24h, Volume,
 * Holders, Smart money, Market cap, Open. All 11 show from 1440 px; below
 * that the lower-priority ones drop out so the table never scrolls sideways
 * and Market cap and Open stay on screen.
 */
export const TABLE_GRID = cn(
  "grid items-center grid-cols-[24px_minmax(180px,1fr)_76px_90px_48px]",
  "lg:grid-cols-[24px_minmax(180px,1fr)_66px_84px_76px_90px_48px]",
  "xl:grid-cols-[24px_minmax(180px,1fr)_102px_66px_84px_76px_86px_90px_48px]",
  "wide:grid-cols-[24px_minmax(180px,1fr)_102px_66px_84px_76px_86px_64px_84px_90px_48px]",
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

const OPEN = "inline-flex items-center justify-center rounded-md border border-line text-text-3 hover:border-accent/35 hover:bg-accent/8 hover:text-accent-text";

/** The open-the-token arrow at the end of every row (32 px in the table, 28 px on phones). */
export function OpenToken({ address, ticker, small = false }: { address: string; ticker: string; small?: boolean }) {
  const { t, href } = useI18n();
  return (
    <Link href={href(`/token/${address}`)} aria-label={fmt(t.table.open, { ticker })} className={cn(OPEN, small ? "size-7" : "size-8")}>
      <ArrowUpRight size={small ? 14 : 15} strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/** A token's name line, meta line (chain, ticker, age, creator) and badge line. */
function TokenCell({ token }: { token: RankedToken }) {
  const { t, href } = useI18n();
  const { flags } = token;
  const badges = flags.locked || flags.og || flags.isNew || token.issuer || flags.crew || flags.agent;
  return (
    <div role="cell" className="flex min-w-0 items-center gap-2.5 pr-3">
      <TokenAvatar art={token.art} label={token.ticker} pad={token.launchpad} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link
            href={href(`/token/${token.address}`)}
            className="truncate text-[14px] leading-[18px] font-semibold text-text hover:text-accent-text"
          >
            {token.name}
          </Link>
          {flags.hot ? (
            <span className="flex-none">
              <Badge kind="hot" />
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] leading-[14px] whitespace-nowrap text-text-3">
          <ChainMark chain={token.chain} size={10} />
          <span className="max-w-[76px] truncate text-text-2">{token.ticker}</span>
          <span aria-hidden="true">·</span>
          <span className="flex-none">{formatAge(token.ageMinutes)}</span>
          <span className="truncate">{fmt(t.table.by, { creator: token.creator })}</span>
        </span>
        {badges ? (
          <span className="flex min-w-0 items-center gap-1 overflow-hidden [&>span]:flex-none">
            {flags.og ? <Badge kind="og" density="compact" /> : null}
            {flags.isNew ? <Badge kind="new" density="compact" /> : null}
            {flags.locked ? <Badge kind="locked" density="compact" /> : null}
            {token.issuer ? <Badge kind="rwa" value={token.issuer} density="compact" /> : null}
            {/* The narrower tiers keep the badge line short. */}
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
        ) : null}
      </span>
    </div>
  );
}

export function TokenRow({ token, tf }: { token: RankedToken; tf: Timeframe }) {
  const { t } = useI18n();
  const { change, volume } = tokenWindow(token, tf);
  const up = change >= 0;
  return (
    <div role="row" className={cn(TABLE_GRID, "tk-row h-[70px] border-b border-line/65 px-4 last:border-b-0 hover:bg-raised")}>
      <span role="cell" className="font-mono text-[12px] text-text-3">
        {token.rank}
      </span>
      <TokenCell token={token} />
      <div role="cell" className={cn(COLUMN_VISIBILITY.curve, "items-center gap-2")}>
        {token.curve < 1 ? (
          <>
            <CurveBar value={token.curve} className="h-1 w-[52px] flex-none" />
            <span className="font-mono text-[12px] font-semibold">{Math.round(token.curve * 100)}%</span>
          </>
        ) : (
          <span title={t.badges.graduated} className="inline-flex min-w-0 items-center gap-1 pr-2 text-[11px] font-medium text-gold">
            <GraduationCap size={13} strokeWidth={2} aria-hidden="true" className="flex-none" />
            <span className="truncate">{t.badges.graduated}</span>
          </span>
        )}
      </div>
      <div role="cell" className={COLUMN_VISIBILITY.score}>
        <ScorePill score={token.score} level={token.level} />
      </div>
      <div role="cell" className={COLUMN_VISIBILITY.spark}>
        <Sparkline seed={token.spark} points={token.series} up={up} width={72} height={28} className="inline align-baseline" />
      </div>
      <span role="cell" className={cn("text-right font-mono text-[13px] font-medium", up ? "text-pos" : "text-neg")}>
        {formatChange(change)}
      </span>
      <span role="cell" className={cn(COLUMN_VISIBILITY.volume, "text-right font-mono text-[13px] font-medium text-text-2")}>
        {formatUsdCompact(volume, { trimZeros: true })}
      </span>
      <span role="cell" className={cn(COLUMN_VISIBILITY.holders, "text-right font-mono text-[13px] font-medium text-text-2")}>
        {token.holders === null ? "—" : formatInteger(token.holders)}
      </span>
      <div role="cell" className={cn(COLUMN_VISIBILITY.smart, "items-center gap-1.5 pl-1.5")}>
        {token.smartWallets > 0 ? (
          <>
            <Users size={14} strokeWidth={2} aria-hidden="true" className="text-cyan" />
            <span className="font-mono text-[12px] font-semibold text-cyan">+{token.smartWallets}</span>
          </>
        ) : (
          <span className="text-text-3">
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t.table.none}</span>
          </span>
        )}
      </div>
      <span role="cell" className="text-right font-mono text-[13px] font-semibold">
        {formatUsdCompact(token.marketCap)}
      </span>
      <div role="cell" className="flex justify-end">
        <OpenToken address={token.address} ticker={token.ticker} />
      </div>
    </div>
  );
}
