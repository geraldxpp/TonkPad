"use client";

import { ArrowUpRight, Lock, type LucideIcon, ShieldCheck, TriangleAlert, Users, Wallet } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { DevLock, TokenDetail } from "@/shared/types/token-detail";
import { SCORE_LEVELS } from "@/shared/ui/score-levels";
import { safeUrl, top10Band } from "../lib/display";

interface Insight {
  icon: LucideIcon;
  title: string;
  sub: string;
  tone?: string;
}

/** The dev lock's vesting: how far along it is, what's left and the lock contract. */
function LockStatus({ lock }: { lock: DevLock }) {
  const { t } = useI18n();
  const tl = t.token.tele;
  const share = Math.min(100, (lock.elapsedDays / lock.vestDays) * 100);
  const url = safeUrl(lock.contractUrl);
  const verify = (
    <>
      {fmt(tl.verify, { address: lock.contract })}
      <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
    </>
  );
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-locked/18"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={lock.vestDays}
        aria-valuenow={lock.elapsedDays}
        aria-label={tl.devLock}
      >
        <span className="h-full rounded-full bg-locked" style={{ width: `${share}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[11px] text-text-2">
        <span>{fmt(tl.day, { day: lock.elapsedDays, days: lock.vestDays, next: lock.nextUnlockDays })}</span>
        <span className="text-locked">{fmt(tl.left, { days: lock.vestDays - lock.elapsedDays })}</span>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start rounded text-[12px] font-semibold text-accent-text">
          {verify}
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 self-start text-[12px] font-semibold text-accent-text">{verify}</span>
      )}
    </div>
  );
}

/**
 * "Token insights": the Mission score, then the dev lock, the top 10 holders'
 * share and smart money. A live token without lock data says so rather than
 * reading as unlocked.
 */
export function InsightsCard({ detail }: { detail: TokenDetail }) {
  const { t } = useI18n();
  const i = t.token.insights;
  const s = t.token.stats;
  const { token, stats, devLock } = detail;
  const live = detail.source === "live";
  const band = stats.top10Share === null ? null : top10Band(stats.top10Share);
  const items: Insight[] = [
    devLock
      ? { icon: Lock, title: fmt(i.devLocked, { pct: Math.round(devLock.share * 100) }), sub: fmt(s.vest, { days: devLock.vestDays }), tone: "text-locked" }
      : live
        ? { icon: Lock, title: i.lockUnknown, sub: t.token.live.unavailable }
        : { icon: Lock, title: i.noLock, sub: i.canMove, tone: "text-warn" },
    {
      icon: Users,
      title: stats.top10Share === null ? "—" : `${(stats.top10Share * 100).toFixed(1)}%`,
      sub: `${i.top10} · ${band ? s[band.label] : t.token.live.unavailable}`,
      tone: band?.tone,
    },
    {
      icon: Wallet,
      title: token.smartWallets > 0 ? fmt(i.smart, { count: token.smartWallets }) : i.smartNone,
      sub: t.table.smart,
      tone: token.smartWallets > 0 ? "text-cyan" : undefined,
    },
  ];
  const Level = token.level === "Risky" ? TriangleAlert : ShieldCheck;
  return (
    <section aria-labelledby="insights-title" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 max-md:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] text-text-3">{i.eyebrow}</span>
          <h2 id="insights-title" className="font-display text-[20px] leading-6 font-bold tracking-[-0.02em]">
            {i.title}
          </h2>
        </div>
        <p
          title={fmt(t.score.title, { score: token.score, level: t.score[token.level] })}
          className={cn("m-0 inline-flex flex-none items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1.5", SCORE_LEVELS[token.level])}
        >
          <Level size={14} strokeWidth={2.3} aria-hidden="true" />
          <span className="sr-only">{fmt(i.score, { score: token.score })}</span>
          <span aria-hidden="true" className="font-mono text-[15px] leading-5 font-semibold">
            {token.score}
          </span>
          <span aria-hidden="true" className="font-mono text-[11px] opacity-70">
            / 100
          </span>
        </p>
      </div>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {items.map(({ icon: Icon, title, sub, tone }) => (
          <li key={sub} className="flex min-w-0 items-center gap-3">
            <span className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-raised text-text-3">
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong className={cn("text-[12px] font-semibold", tone)}>{title}</strong>
              <span className="text-[11px] text-text-3">{sub}</span>
            </div>
          </li>
        ))}
      </ul>
      {devLock ? <LockStatus lock={devLock} /> : null}
    </section>
  );
}
