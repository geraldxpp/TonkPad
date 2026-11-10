"use client";

import { ArrowUpRight, ChevronRight, Compass, Layers } from "lucide-react";
import Link from "next/link";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import type { SwapToken } from "@/shared/types/swap";
import { ChainMark } from "@/shared/ui/ChainMark";
import { Sparkline } from "@/shared/ui/Sparkline";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { SwapListing } from "../data/get-swap-data";

/** "Get to know your token": the listed token in the pair, with its 24h line, market cap and a link to its page. */
function TokenContext({ listing }: { listing: SwapListing }) {
  const { t, href } = useI18n();
  const s = t.swap;
  const up = listing.change24h >= 0;
  return (
    <section aria-labelledby="swap-context-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <span className="text-[11px] text-text-3">{s.contextTitle}</span>
      <div className="flex items-center gap-3">
        <TokenArt src={listing.art} label={listing.symbol} size={40} className="size-10 flex-none rounded-[10px] object-cover" />
        <div className="flex min-w-0 flex-auto flex-col">
          <h2 id="swap-context-title" className="truncate font-display text-[18px] leading-6 font-bold tracking-[-0.02em]">
            {listing.name}
          </h2>
          <span className="truncate font-mono text-[11px] text-text-3">{listing.symbol}</span>
        </div>
        <Link
          href={href(`/token/${listing.address}`)}
          aria-label={fmt(s.openToken, { name: listing.name })}
          className="inline-flex size-8 flex-none items-center justify-center rounded-lg border border-line text-text-3 hover:border-accent/35 hover:text-accent-text"
        >
          <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[22px] leading-7 font-semibold tracking-[-0.04em]">{formatUsdCompact(listing.marketCap)}</span>
        <span className={cn("ml-auto font-mono text-[11px] font-semibold", up ? "text-pos" : "text-neg")}>{formatChange(listing.change24h)}</span>
        <span className="text-[10px] text-text-3">{t.token.h24}</span>
      </div>
      <Sparkline seed={listing.spark} points={listing.series} up={up} width={320} height={84} className="h-[84px] w-full" />
      <div className="flex justify-between gap-4 border-t border-line pt-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-text-3">{s.marketCap}</span>
          <span className="font-mono text-[13px] font-medium">{formatUsdCompact(listing.marketCap)}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] text-text-3">{s.network}</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
            <ChainMark chain={listing.chain} size={14} letterSize={7} decorative />
            {CHAINS[listing.chain].name}
          </span>
        </div>
      </div>
    </section>
  );
}

/** "A clear path.": what's paid, the venues the route runs through, and what's received. */
function RouteCard({ from, to, venues }: { from: SwapToken; to: SwapToken; venues: string | null }) {
  const { t } = useI18n();
  const s = t.swap;
  const end = (token: SwapToken) => (
    <span className="flex min-w-12 flex-col items-center gap-2">
      <TokenArt src={token.icon ?? ""} label={token.symbol} size={32} className="size-8 rounded-full object-cover" />
      <span className="max-w-20 truncate font-mono text-[11px] font-medium">{token.symbol}</span>
    </span>
  );
  return (
    <section aria-labelledby="swap-route-title" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5">
      <h2 id="swap-route-title" className="font-display text-[17px] leading-6 font-bold tracking-[-0.02em]">
        {s.routeTitle}
      </h2>
      <div className="flex items-start gap-1">
        {end(from)}
        <span aria-hidden="true" className="mt-4 flex-1 border-t border-dashed border-line-strong" />
        <span className="flex min-w-0 max-w-[45%] flex-col items-center gap-2 text-center">
          <span className="flex size-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/6 text-accent-text">
            <Layers size={15} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="line-clamp-2 text-[11px] text-text-3">{venues ?? "—"}</span>
        </span>
        <span aria-hidden="true" className="mt-4 flex-1 border-t border-dashed border-line-strong" />
        {end(to)}
      </div>
      <span className="text-center text-[11px] text-text-3">{s.routeCaption}</span>
    </section>
  );
}

interface SwapSideProps {
  from: SwapToken | null;
  to: SwapToken | null;
  listing: SwapListing | null;
  venues: string | null;
}

/** The column beside the swap: the token, the route and a way back to Explore. */
export function SwapSide({ from, to, listing, venues }: SwapSideProps) {
  const { t, href } = useI18n();
  const s = t.swap;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {listing ? <TokenContext listing={listing} /> : null}
      {from && to ? <RouteCard from={from} to={to} venues={venues} /> : null}
      <Link href={href("/")} className="flex items-center gap-3 rounded-2xl border border-line p-4 hover:bg-raised/50">
        <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-accent/8 text-accent-text">
          <Compass size={17} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-auto flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{s.exploreTitle}</span>
          <span className="text-[11px] text-text-3">{s.exploreBody}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className="flex-none text-text-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
