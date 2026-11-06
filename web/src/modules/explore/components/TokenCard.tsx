"use client";

import Link from "next/link";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatAge, formatChange, formatUsdCompact } from "@/shared/lib/format";
import type { Token } from "@/shared/types/token";
import { Badge } from "@/shared/ui/Badge";
import { ChainMark } from "@/shared/ui/ChainMark";
import { CurveBar } from "@/shared/ui/CurveBar";
import { PadMark } from "@/shared/ui/PadMark";
import { Sparkline } from "@/shared/ui/Sparkline";
import { TokenArt } from "@/shared/ui/TokenArt";

interface TokenCardProps {
  token: Token;
  /** Background colour behind the art (`C2` in the reference). */
  color: string;
  rank: number;
}

/**
 * Art-led card that lifts 4 px with a blue ring on hover or focus. The art
 * tile stays dark in both themes (data-theme="dark" scopes the dark tokens).
 */
export function TokenCard({ token, color, rank }: TokenCardProps) {
  const { t, href } = useI18n();
  const up = token.change24h >= 0;
  const mcap = formatUsdCompact(token.marketCap);
  const change = formatChange(token.change24h);
  const { flags } = token;
  return (
    <Link
      href={href(`/token/${token.address}`)}
      aria-label={fmt(t.heating.cardLabel, { name: token.name, mcap, change })}
      data-theme="dark"
      className="tk-card relative block h-[320px] w-[244px] flex-none overflow-hidden rounded-[22px] border border-white/8 text-white max-md:h-[296px] max-md:w-[172px] max-md:rounded-[20px]"
      style={{ background: `linear-gradient(180deg, ${color}, #0A0B0E)` }}
    >
      <TokenArt
        src={token.art}
        label={token.ticker}
        size={244}
        eager
        className="absolute -top-[10px] left-0 aspect-square w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 h-[214px] bg-[linear-gradient(180deg,rgba(10,11,14,0),rgba(10,11,14,0.86)_46%,#0A0B0E)]" />
      <span className="absolute top-3 left-3 rounded-lg bg-bg-deep/55 px-2 py-1 font-mono text-[12px] font-semibold">
        #{rank}
      </span>
      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-lg bg-bg-deep/55 p-1">
        <ChainMark chain={token.chain} size={16} />
        <PadMark pad={token.launchpad} />
      </span>
      <div className="absolute right-4 bottom-3.5 left-4 flex flex-col gap-2 max-md:right-3 max-md:bottom-3 max-md:left-3 max-md:gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[20px] leading-6 font-bold tracking-[-0.01em]">{token.name}</span>
          <span className="font-mono text-[12px] text-white/62">${token.ticker}</span>
        </div>
        <div className="flex min-h-5 flex-wrap gap-1">
          {flags.locked ? <Badge kind="locked" tone="card" /> : null}
          {flags.crew ? <Badge kind="crew" value={flags.crew} tone="card" /> : null}
          {flags.agent ? <Badge kind="agent" tone="card" /> : null}
        </div>
        <div className="flex items-end justify-between gap-2">
          {/* Phones stack the change under the market cap to keep room for the sparkline. */}
          <div className="flex items-baseline gap-2 max-md:flex-col max-md:items-start max-md:gap-0">
            <span className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.02em] max-md:text-[18px] max-md:leading-6">
              {mcap}
            </span>
            <span className={cn("font-mono text-[12px] font-semibold", up ? "text-pos" : "text-neg")}>{change}</span>
          </div>
          <Sparkline seed={token.spark} points={token.series} up={up} width={72} height={24} className="min-w-0" />
        </div>
        {token.curve < 1 ? (
          <div className="flex items-center gap-2">
            <CurveBar value={token.curve} className="h-[5px] flex-auto" />
            <span className="font-mono text-[12px] whitespace-nowrap text-white/72">
              {fmt(t.heating.curve, { pct: Math.round(token.curve * 100) })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge kind="graduated" />
            <span className="font-mono text-[12px] text-white/62">{fmt(t.heating.ago, { age: formatAge(token.ageMinutes) })}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
