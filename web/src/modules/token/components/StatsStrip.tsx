"use client";

import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatInteger, formatUsdCompact } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { top10Band } from "../lib/display";
import { coinOf, formatNative, formatSigned } from "../lib/format";

interface Stat {
  label: string;
  value: string;
  sub: string;
  tone: string;
}

/** Six figures under the header: market cap, volume, liquidity, holders, top 10 and the dev lock. */
export function StatsStrip({ detail }: { detail: TokenDetail }) {
  const { t } = useI18n();
  const s = t.token.stats;
  const { token, stats, devLock } = detail;
  const marketAvailable = detail.marketAvailable !== false;
  const band = stats.top10Share === null ? null : top10Band(stats.top10Share);
  const cells: Stat[] = [
    {
      label: t.token.marketCap,
      value: marketAvailable ? formatUsdCompact(token.marketCap) : "—",
      sub: marketAvailable ? fmt(s.change, { change: formatChange(token.change24h) }) : t.token.live.unavailable,
      tone: !marketAvailable ? "text-text-3" : token.change24h >= 0 ? "text-pos" : "text-neg",
    },
    { label: s.volume, value: marketAvailable ? formatUsdCompact(token.volume24h) : "—", sub: !marketAvailable || stats.txns24h === null ? t.token.live.unavailable : fmt(s.txns, { count: formatInteger(stats.txns24h) }), tone: "text-text-3" },
    {
      label: s.liquidity,
      value: stats.liquidity === null ? "—" : `${formatNative(stats.liquidity)} ${coinOf(token.chain)}`,
      sub: stats.liquidity === null ? t.token.live.unavailable : stats.liquidityIn === "curve" ? s.inCurve : s.inPool,
      tone: "text-text-3",
    },
    {
      label: s.holders,
      value: token.holders === null ? "—" : formatInteger(token.holders),
      sub: stats.holdersChange1h === null ? t.token.live.unavailable : fmt(s.holdersChange, { change: formatSigned(stats.holdersChange1h) }),
      tone: stats.holdersChange1h === null ? "text-text-3" : stats.holdersChange1h >= 0 ? "text-pos" : "text-neg",
    },
    { label: s.top10, value: stats.top10Share === null ? "—" : `${(stats.top10Share * 100).toFixed(1)}%`, sub: band ? s[band.label] : t.token.live.unavailable, tone: band?.tone ?? "text-text-3" },
    {
      label: s.devLocked,
      value: devLock ? `${Math.round(devLock.share * 100)}%` : "—",
      // The full "lock data is unavailable" sentence is for Mission telemetry; a stat cell has room for the short form.
      sub: devLock ? fmt(s.vest, { days: devLock.vestDays }) : detail.source === "live" ? t.token.live.unavailable : s.noLock,
      tone: devLock ? "text-locked" : "text-text-3",
    },
  ];
  return (
    <section aria-label={s.label} className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {cells.map((cell) => (
          <div key={cell.label} className="-ml-px flex flex-col gap-0.5 border-l border-line px-[18px] py-3.5">
            <dt className="text-[12px] text-text-3">{cell.label}</dt>
            <dd className="font-mono text-[14px] leading-5 font-semibold">{cell.value}</dd>
            <dd className={cn("text-[12px]", cell.tone)}>{cell.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
