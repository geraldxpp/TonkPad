"use client";

import Link from "next/link";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import type { Token } from "@/shared/types/token";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { CurveBar } from "@/shared/ui/CurveBar";
import { PadMark } from "@/shared/ui/PadMark";
import { Sparkline } from "@/shared/ui/Sparkline";
import { TokenArt } from "@/shared/ui/TokenArt";

interface TokenCardProps {
  token: Token;
  rank: number;
}

/**
 * A compact spotlight card: art, name and marks, the market cap with its
 * sparkline and 24h change, then the bonding curve (or Graduated). It lifts
 * 4 px with a cyan ring on hover or focus. The art tile stays dark in both
 * themes (data-theme="dark" scopes the dark tokens).
 */
export function TokenCard({ token, rank }: TokenCardProps) {
  const { t, href } = useI18n();
  const up = token.change24h >= 0;
  const mcap = formatUsdCompact(token.marketCap);
  const change = formatChange(token.change24h);
  const { flags } = token;
  return (
    <Link
      href={href(`/token/${token.address}`)}
      aria-label={fmt(t.heating.cardLabel, { name: token.name, mcap, change })}
      className="tk-card relative flex h-[172px] w-[272px] flex-none flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface p-4 max-md:w-[248px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span data-theme="dark" className="relative flex size-11 flex-none overflow-hidden rounded-[10px] bg-raised">
          <TokenArt src={token.art} label={token.ticker} size={44} eager className="size-11 object-cover" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[14px] font-semibold" title={token.name}>
            {token.name}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-text-3">
            <span className="max-w-28 truncate">{token.ticker}</span>
            <ChainMark chain={token.chain} size={12} decorative />
            <PadMark pad={token.launchpad} decorative />
          </span>
        </span>
        <span className="self-start font-mono text-[10px] text-text-3">{String(rank).padStart(2, "0")}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-[10px] text-text-3">{t.table.marketCap}</span>
          <div className="mt-1 font-mono text-[24px] leading-7 font-semibold tracking-[-0.05em]">{mcap}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Sparkline seed={token.spark} points={token.series} up={up} width={72} height={25} />
          <span className={cn("font-mono text-[11px] font-medium", up ? "text-pos" : "text-neg")}>{change}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-t border-line pt-2.5">
        {token.curve < 1 ? (
          <>
            <CurveBar value={token.curve} className="h-[3px] flex-1" />
            <span className="font-mono text-[10px] whitespace-nowrap text-text-3">
              {fmt(t.heating.curve, { pct: Math.round(token.curve * 100) })}
            </span>
          </>
        ) : (
          <Badge kind="graduated" />
        )}
        {/* One mark fits beside the curve; a verified issuer outranks Locked (live data never has both). */}
        {token.issuer ? (
          <Badge kind="rwa" value={token.issuer} density="compact" />
        ) : flags.locked ? (
          <Badge kind="locked" density="compact" />
        ) : null}
      </div>
    </Link>
  );
}
