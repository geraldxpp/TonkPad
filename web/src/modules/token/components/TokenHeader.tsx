"use client";

import { ArrowUpRight, Bot, Check, Lock, ShieldCheck, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatAge } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { ChainMark } from "@/shared/ui/ChainMark";
import { PadMark } from "@/shared/ui/PadMark";
import { TokenArt } from "@/shared/ui/TokenArt";
import { padLabel } from "../lib/display";
import { CopyAddress, HeaderActions } from "./HeaderActions";

const TAG = "inline-flex items-center gap-1 rounded px-1.5 py-[3px] text-[11px] leading-4 font-semibold whitespace-nowrap";

/** One of the header's marks: tinted, without a border. */
export function Tag({ tone, title, children }: { tone: string; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cn(TAG, tone)}>
      {children}
    </span>
  );
}

/**
 * The token's identity, without a card: art, name and ticker, chain and age,
 * the links, star and Share; then the contract, the launchpad and its marks.
 * A page that knows more adds its own marks (`tags`) and the explorer's link.
 */
export function TokenHeader({ detail, explorerUrl, tags }: { detail: TokenDetail; explorerUrl?: string; tags?: ReactNode }) {
  const { t } = useI18n();
  const { token } = detail;
  return (
    <section aria-labelledby="token-name" className="flex min-w-0 flex-col gap-4 max-md:gap-3">
      <div className="flex min-w-0 items-center gap-3.5 max-md:gap-3">
        <span data-theme="dark" className="flex size-14 flex-none overflow-hidden rounded-[14px] border border-line bg-raised max-md:size-12 max-md:rounded-xl">
          <TokenArt src={token.art} label={token.ticker} size={56} brand={token.launchpad === "tonk"} eager alt={fmt(t.token.artAlt, { name: token.name })} className="size-full object-cover" />
        </span>
        <div className="flex min-w-0 flex-auto flex-col gap-1.5 max-md:gap-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1
              id="token-name"
              className="min-w-0 max-w-full font-display text-[32px] leading-9 font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere] max-md:text-[27px] max-md:leading-8"
            >
              {token.name}
            </h1>
            <span className="min-w-0 max-w-full font-mono text-[12px] font-semibold text-text-3 [overflow-wrap:anywhere]">{token.ticker}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-text-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ChainMark chain={token.chain} size={13} letterSize={7} decorative />
              {CHAINS[token.chain].name}
            </span>
            <span aria-hidden="true">·</span>
            <span>{fmt(t.token.trades.ago, { time: formatAge(token.ageMinutes, t.token.trades.units) })}</span>
          </div>
        </div>
        <HeaderActions token={token} links={detail.links} market={{ chain: token.chain, priceUsd: detail.priceUsd, marketCap: token.marketCap }} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2">
        <CopyAddress contract={detail.contract} />
        {explorerUrl ? (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={t.launch.receipt.viewToken} title={t.launch.receipt.viewToken} className="inline-flex rounded text-text-3 hover:text-text">
            <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
        <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
        <span className="inline-flex items-center gap-1.5 text-[12px] text-text-2">
          <PadMark pad={token.launchpad} size={16} decorative />
          {padLabel(token.launchpad, t.token.native)}
        </span>
        {token.launchpad === "tonk" && token.flags.locked ? (
          <Tag tone="bg-locked/10 text-locked">
            <Lock size={11} strokeWidth={2.4} aria-hidden="true" />
            {t.token.badges.lockedMission}
            <Check size={11} strokeWidth={3} role="img" aria-label={t.token.badges.verified} />
          </Tag>
        ) : null}
        {/* Crew rewards are tonkfun.fun's: the tag follows the token's crew data, which only its launches have. */}
        {detail.crew ? (
          <Tag tone="bg-gold/10 text-gold">
            <Zap size={11} fill="currentColor" stroke="none" aria-hidden="true" />
            {fmt(t.token.badges.crew, { pct: `${detail.crew.sharePct}%` })}
          </Tag>
        ) : null}
        {detail.agent && token.flags.agent ? (
          <Tag tone="bg-agent/10 text-agent">
            <Bot size={11} strokeWidth={2.2} aria-hidden="true" />
            {t.token.badges.agent}
          </Tag>
        ) : null}
        {token.issuer ? (
          <Tag tone="bg-accent/10 text-accent-text" title={fmt(t.badges.rwaTitle, { issuer: token.issuer })}>
            <ShieldCheck size={11} strokeWidth={2.4} aria-hidden="true" />
            {t.badges.rwa}
          </Tag>
        ) : null}
        {tags}
      </div>
    </section>
  );
}
