"use client";

import { ArrowUpRight, Lock, ShieldCheck, Zap } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatUsd } from "@/shared/lib/format";
import type { CrewRewards, DevLock } from "@/shared/types/token-detail";
import { safeUrl } from "../../lib/display";
import { formatDay } from "../../lib/format";

const BOX = "flex flex-col gap-2.5 rounded-2xl border border-line bg-raised p-3.5";
const KICKER = "flex items-center gap-2 text-[12px] text-text-3";

/** Dev lock status and crew rewards from the token's telemetry. */
export function MissionTelemetry({ devLock, crew, live = false }: { devLock: DevLock | null; crew: CrewRewards | null; live?: boolean }) {
  const { t, lang } = useI18n();
  const tl = t.token.tele;
  return (
    <section aria-labelledby="tele-title" className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} strokeWidth={2} className={live && !devLock && !crew ? "text-text-3" : "text-locked"} aria-hidden="true" />
        <h2 id="tele-title" className="flex-auto text-[14px] font-semibold">{tl.title}</h2>
        {devLock || crew ? <span className="rounded-lg bg-locked/14 px-2 py-[3px] text-[12px] font-semibold text-locked">{tl.verified}</span> : null}
      </div>
      <div className={BOX}>
        <div className={KICKER}>
          <Lock size={14} strokeWidth={2.2} className={live && !devLock ? "text-text-3" : "text-locked"} aria-hidden="true" />
          {tl.devLock}
        </div>
        {devLock ? <LockStatus lock={devLock} started={formatDay(devLock.startedAt, lang)} /> : <p className="text-[13px] text-text-2">{live ? t.token.live.unknownLock : t.token.agent.noLock}</p>}
      </div>
      {crew ? (
        <div className={BOX}>
          <div className={KICKER}>
            <Zap size={14} fill="currentColor" stroke="none" className="text-gold" aria-hidden="true" />
            {tl.crew}
            <span className="flex-auto" />
            <span className="inline-flex items-center gap-1.5 text-pos">
              <span aria-hidden="true" className="size-1.5 animate-[tk-pulse_2s_ease-in-out_infinite] rounded-full bg-pos" />
              {fmt(tl.lastPayout, { seconds: crew.lastPayoutSeconds })}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[28px] leading-8 font-semibold tracking-[-0.03em] text-gold">{formatUsd(crew.paidUsd, 0)}</span>
              <span className="text-[12px] text-text-2">{fmt(tl.paid, { pct: crew.sharePct })}</span>
            </div>
            <PayoutBars daily={crew.daily} label={tl.payouts} />
          </div>
          <span className="text-[12px] text-text-3">{tl.auto}</span>
        </div>
      ) : null}
    </section>
  );
}

function LockStatus({ lock, started }: { lock: DevLock; started: string }) {
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
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{fmt(tl.locked, { pct: Math.round(lock.share * 100) })}</span>
        <span className="text-[12px] text-text-2">{fmt(tl.vest, { days: lock.vestDays, unlocks: lock.unlocks, date: started })}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-[5px] bg-locked/22" role="progressbar" aria-valuemin={0} aria-valuemax={lock.vestDays} aria-valuenow={lock.elapsedDays} aria-label={tl.devLock}>
        <span className="h-full bg-locked" style={{ width: `${share}%` }} />
      </div>
      <div className="flex justify-between gap-2 font-mono text-[12px] text-text-2">
        <span>{fmt(tl.day, { day: lock.elapsedDays, days: lock.vestDays, next: lock.nextUnlockDays })}</span>
        <span className="flex-none text-locked">{fmt(tl.left, { days: lock.vestDays - lock.elapsedDays })}</span>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-accent-text">
          {verify}
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-accent-text">{verify}</span>
      )}
    </>
  );
}

/** Fourteen days of payouts; today's bar in full gold. */
function PayoutBars({ daily, label }: { daily: readonly number[]; label: string }) {
  const top = Math.max(1, ...daily);
  return (
    <div role="img" aria-label={label} className="flex h-10 flex-none items-end gap-[3px]">
      {daily.map((value, i) => (
        <span
          key={i}
          className={i === daily.length - 1 ? "w-1.5 rounded-[2px] bg-gold" : "w-1.5 rounded-[2px] bg-gold/45"}
          style={{ height: Math.max(4, Math.round((value / top) * 40)) }}
        />
      ))}
    </div>
  );
}
