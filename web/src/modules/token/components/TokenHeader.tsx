"use client";

import { Bot, Check, Lock, ShieldCheck, TriangleAlert, Zap } from "lucide-react";
import { CHAINS } from "@/shared/config/chains";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatPrice, formatUsdCompact } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { ChainMark } from "@/shared/ui/ChainMark";
import { PadMark } from "@/shared/ui/PadMark";
import { SCORE_LEVELS } from "@/shared/ui/score-levels";
import { TokenArt } from "@/shared/ui/TokenArt";
import { padLabel, walletDot } from "../lib/display";
import { daysBetween, formatDay } from "../lib/format";
import { HeaderActions } from "./HeaderActions";

const PILL = "inline-flex items-center gap-[5px] rounded-lg border py-1 pr-[9px] pl-[7px] text-[12px] font-semibold";
const CHIP = "inline-flex items-center gap-1.5 border border-line-strong bg-raised py-[3px] pr-[9px] pl-1 text-[12px] font-medium";
/** The export's blue glow behind the art and the faint green one up top; lighter on the light theme's white card. */
const GLOW =
  "bg-surface bg-[image:radial-gradient(42%_110%_at_10%_30%,rgb(var(--accent-rgb)/0.42),transparent),radial-gradient(35%_80%_at_42%_0%,rgb(var(--neon-rgb)/0.1),transparent)] light:bg-[image:radial-gradient(42%_110%_at_10%_30%,rgb(var(--accent-rgb)/0.16),transparent),radial-gradient(35%_80%_at_42%_0%,rgb(var(--neon-rgb)/0.08),transparent)]";

/** The header card: art, name, chain and launchpad, badges, links, and the market cap on the right. */
export function TokenHeader({ detail }: { detail: TokenDetail }) {
  const { t, lang } = useI18n();
  const { token } = detail;
  const marketAvailable = detail.marketAvailable !== false;
  const days = daysBetween(detail.launchedAt, detail.updatedAt);
  return (
    <section
      aria-labelledby="token-name"
      className={cn("relative flex flex-wrap items-start gap-6 overflow-hidden rounded-3xl border border-line p-7 shadow-panel max-md:gap-5 max-md:p-5", GLOW)}
    >
      <TokenArt
        src={token.art}
        label={token.ticker}
        size={112}
        eager
        alt={fmt(t.token.artAlt, { name: token.name })}
        className="size-28 flex-none rounded-[30px] shadow-[0_12px_32px_-6px_rgb(var(--accent-rgb)/0.55)] max-md:size-20 max-md:rounded-[22px]"
      />
      <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 id="token-name" className="min-w-0 max-w-full font-display text-[40px] leading-[44px] font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere] max-md:text-[32px] max-md:leading-9">
            {token.name}
          </h1>
          <span className={cn(CHIP, "rounded-full")}>
            <ChainMark chain={token.chain} size={18} letterSize={9} decorative />
            {CHAINS[token.chain].name}
          </span>
          <span className={cn(CHIP, "rounded-lg text-text-2")}>
            <PadMark pad={token.launchpad} size={18} decorative />
            {padLabel(token.launchpad, t.token.native)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-3">
          <span className="min-w-0 max-w-full font-mono text-[14px] font-medium text-text-2 [overflow-wrap:anywhere]">${token.ticker}</span>
          <span>· {t.token.by}</span>
          <span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: walletDot(token.creator) }} />
          <span className="font-mono text-text-2">{token.creator}</span>
          <span>· {fmt(t.token.launched, { date: formatDay(detail.launchedAt, lang), days })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {token.launchpad === "tonk" && token.flags.locked ? (
            <span className={cn(PILL, "border-locked/38 bg-locked/14 text-locked")}>
              <Lock size={13} strokeWidth={2.4} aria-hidden="true" />
              {t.token.badges.lockedMission}
              <Check size={12} strokeWidth={3} role="img" aria-label={t.token.badges.verified} />
            </span>
          ) : null}
          {/* Crew rewards are Tonkpad's: the badge follows the token's crew data, which only Tonkpad launches have. */}
          {detail.crew ? (
            <span className={cn(PILL, "border-gold/38 bg-accent/16 text-gold")}>
              <Zap size={13} fill="currentColor" stroke="none" aria-hidden="true" />
              {fmt(t.token.badges.crew, { pct: `${detail.crew.sharePct}%` })}
            </span>
          ) : null}
          {detail.agent && token.flags.agent ? (
            <span className={cn(PILL, "border-agent/38 bg-agent/14 text-agent")}>
              <Bot size={13} strokeWidth={2.2} aria-hidden="true" />
              {t.token.badges.agent}
            </span>
          ) : null}
          {token.issuer ? (
            <span title={fmt(t.badges.rwaTitle, { issuer: token.issuer })} className={cn(PILL, "border-accent/38 bg-accent/14 text-accent-text")}>
              <ShieldCheck size={13} strokeWidth={2.4} aria-hidden="true" />
              {t.badges.rwa}
            </span>
          ) : null}
          <span
            title={fmt(t.score.title, { score: token.score, level: t.score[token.level] })}
            className={cn(PILL, "gap-1 border-0 font-mono leading-[normal]", SCORE_LEVELS[token.level])}
          >
            {token.level === "Risky" ? (
              <TriangleAlert size={13} strokeWidth={2.3} aria-hidden="true" />
            ) : (
              <ShieldCheck size={13} strokeWidth={2.3} aria-hidden="true" />
            )}
            {fmt(t.token.badges.score, { score: token.score })}
          </span>
        </div>
        <HeaderActions token={token} contract={detail.contract} links={detail.links} />
      </div>
      <div className="flex flex-[1_1_180px] flex-col items-end gap-0.5 text-right max-md:items-start max-md:text-left">
        <span className="text-[12px] text-text-3">{t.token.marketCap}</span>
        <span className="font-mono text-[40px] leading-[44px] font-semibold tracking-[-0.03em] max-md:text-[32px] max-md:leading-9">
          {marketAvailable ? formatUsdCompact(token.marketCap) : "—"}
        </span>
        <span className={cn("font-mono text-[14px] font-semibold", !marketAvailable ? "text-text-3" : token.change24h >= 0 ? "text-pos" : "text-neg")}>
          {marketAvailable ? formatChange(token.change24h) : "—"} <span className="font-sans text-[12px] font-normal text-text-3">{t.token.h24}</span>
        </span>
        <span className="font-mono text-[12px] text-text-3">{fmt(t.token.perToken, { price: !marketAvailable || detail.priceUsd === null ? "—" : formatPrice(detail.priceUsd) })}</span>
      </div>
    </section>
  );
}
