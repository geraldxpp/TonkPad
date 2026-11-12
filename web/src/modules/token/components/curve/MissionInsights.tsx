"use client";

import { ArrowUpRight, Lock, Users, Wallet } from "lucide-react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatTokens, formatTokensFull } from "@/shared/tonk/format";
import { claimableAt, DAY_SECONDS, type DevLockState, lockedAt } from "@/shared/tonk/lock";
import { type MissionJson, missionLock } from "@/shared/tonk/mission";
import { explorerAddressUrl, type TonkNetwork } from "@/shared/tonk/networks";
import { top10Band } from "../../lib/display";
import { formatDate, shortAddress } from "../../lib/format";
import { type Insight, InsightsFrame } from "../InsightsCard";

interface LockFactsProps {
  lock: DevLockState;
  /** Unix seconds: the page's latest read of the chain. */
  now: number;
  ticker: string;
  network: TonkNetwork;
}

/** The lock in full, as the launchpad holds it: its kind, what has unlocked, what was claimed, what is still locked and when it ends. */
function LockFacts({ lock, now, ticker, network }: LockFactsProps) {
  const { t, lang } = useI18n();
  const f = t.mission.facts;
  const locked = lockedAt(lock, now);
  const unlocked = lock.total - locked;
  const pct = lock.total > BigInt(0) ? Number((unlocked * BigInt(10_000)) / lock.total) / 100 : 0;
  const amount = (wei: bigint) => `${formatTokens(wei)} ${ticker}`;
  const rows: [string, string, string | undefined][] = [
    [t.launch.lock.mode, lock.type === "time" ? t.launch.lock.time : t.launch.lock.linear, undefined],
    [f.locked, amount(locked), formatTokensFull(locked)],
    [f.unlocked, amount(unlocked), formatTokensFull(unlocked)],
    [f.claimed, amount(lock.claimed), formatTokensFull(lock.claimed)],
    [f.ends, formatDate(lock.end * 1000, lang), new Date(lock.end * 1000).toISOString()],
  ];
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-locked/18" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t.token.tele.devLock}>
        <span className="h-full rounded-full bg-locked" style={{ width: `${pct}%` }} />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
        {rows.map(([label, value, full]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[11px] text-text-3">{label}</dt>
            <dd title={full} className="m-0 font-mono text-[12px] font-semibold [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <a href={explorerAddressUrl(network, network.launchpad)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start rounded text-[12px] font-semibold text-accent-text">
        {fmt(t.token.tele.verify, { address: shortAddress(network.launchpad) })}
        <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
      </a>
    </div>
  );
}

/** The top 10 holders' share: the indexer's figure, or why there is none yet. */
export type Top10 = { share: number } | "loading" | "unavailable" | "later";

interface MissionInsightsProps {
  mission: MissionJson;
  /** The Mission score from the chain's facts. */
  score: number;
  level: "Safe" | "Caution" | "Risky";
  network: TonkNetwork;
  top10: Top10;
}

/**
 * "Token insights" for a mission read from the chain: the Mission score from
 * the rows the chain answers, the creator's lock, and the creator; and the
 * top holders' share from the indexer, or why it isn't there (loading, not
 * reachable, or not on testnet yet) instead of a guess.
 */
export function MissionInsights({ mission, score, level, network, top10 }: MissionInsightsProps) {
  const { t } = useI18n();
  const i = t.token.insights;
  const band = typeof top10 === "object" ? top10Band(top10.share) : null;
  const top10Note = band ? t.token.stats[band.label] : top10 === "later" ? t.launch.testnet.laterTitle : top10 === "unavailable" ? t.token.live.unavailable : null;
  const now = Math.floor(mission.readAt / 1000);
  const lock = mission.lock ? missionLock(mission.lock) : null;
  // A lock that has run out, or been claimed in full, holds nothing back any more.
  const holding = lock !== null && lockedAt(lock, now) + claimableAt(lock, now) > BigInt(0);
  const days = lock ? Math.max(1, Math.round((lock.end - lock.start) / DAY_SECONDS)) : 0;
  const items: Insight[] = [
    lock && holding
      ? { icon: Lock, title: fmt(i.devLocked, { pct: Math.round(lock.lockedBps / 100) }), sub: lock.type === "time" ? t.launch.lock.time : fmt(t.token.stats.vest, { days }), tone: "text-locked" }
      : { icon: Lock, title: i.noLock, sub: i.canMove, tone: "text-warn" },
    {
      icon: Users,
      title: typeof top10 === "object" ? `${(top10.share * 100).toFixed(1)}%` : "—",
      sub: top10Note ? `${i.top10} · ${top10Note}` : i.top10,
      tone: band?.tone,
    },
    { icon: Wallet, title: shortAddress(mission.creator), sub: t.mission.facts.creator, mono: true },
  ];
  return (
    <InsightsFrame score={score} level={level} items={items}>
      {lock ? <LockFacts lock={lock} now={now} ticker={mission.symbol} network={network} /> : null}
    </InsightsFrame>
  );
}
