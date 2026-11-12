"use client";

import { fmt, plural } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import type { TokenDetail } from "@/shared/types/token-detail";
import { coinOf, formatNative, formatSigned } from "../lib/format";
import { coinAmount, moneyCompact, MONEY_UNIT } from "../lib/money";

interface Stat {
  label: string;
  value: string;
  /** The coin the value is counted in, set small beside it (the testnet site, where "test ETH" would crowd the figure). */
  unit?: string | null;
  sub: string | null;
  tone: string;
}

/**
 * The market card's foot: market cap, 24h volume, liquidity and holders, four
 * across from 768 px and two by two on phones. The -1 px margins let cells
 * share single borders however the grid wraps.
 */
export function StatsStrip({ detail }: { detail: TokenDetail }) {
  const { t, lang } = useI18n();
  const s = t.token.stats;
  const { token, stats } = detail;
  const marketAvailable = detail.marketAvailable !== false;
  // What the testnet site can't know before its indexer says so; elsewhere the feed simply has no figure.
  const unknown = MONEY_UNIT ? t.launch.testnet.laterTitle : t.token.live.unavailable;
  const amount = (value: number) => (MONEY_UNIT ? coinAmount(value) : moneyCompact(value));
  const cells: Stat[] = [
    { label: t.token.marketCap, value: marketAvailable ? amount(token.marketCap) : "—", unit: marketAvailable ? MONEY_UNIT : null, sub: null, tone: "" },
    {
      label: s.volume,
      value: marketAvailable ? amount(token.volume24h) : "—",
      unit: marketAvailable ? MONEY_UNIT : null,
      sub: !marketAvailable || stats.txns24h === null ? unknown : plural(lang, s.txns, stats.txns24h, formatInteger(stats.txns24h)),
      tone: "text-text-3",
    },
    {
      label: s.liquidity,
      value: stats.liquidity === null ? "—" : MONEY_UNIT ? formatNative(stats.liquidity) : `${formatNative(stats.liquidity)} ${coinOf(token.chain)}`,
      unit: stats.liquidity === null ? null : MONEY_UNIT,
      sub: stats.liquidity === null ? unknown : stats.liquidityIn === "curve" ? s.inCurve : s.inPool,
      tone: "text-text-3",
    },
    {
      label: s.holders,
      value: token.holders === null ? "—" : formatInteger(token.holders),
      sub: stats.holdersChange1h === null ? unknown : fmt(s.holdersChange, { change: formatSigned(stats.holdersChange1h) }),
      tone: stats.holdersChange1h === null ? "text-text-3" : stats.holdersChange1h >= 0 ? "text-pos" : "text-neg",
    },
  ];
  return (
    <section aria-label={s.label} className="overflow-hidden border-t border-line">
      <dl className="m-0 grid grid-cols-2 md:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="-mt-px -ml-px flex min-w-0 flex-col gap-1 border-t border-l border-line px-5 py-4 max-md:px-3.5 max-md:py-3.5">
            <dt className="text-[11px] text-text-3">{cell.label}</dt>
            <dd className="m-0 font-mono text-[17px] leading-6 font-semibold tracking-[-0.04em] max-md:text-[16px]">
              {cell.value}
              {cell.unit ? <span className="ml-1.5 font-sans text-[11px] font-medium tracking-normal text-text-3">{cell.unit}</span> : null}
            </dd>
            {cell.sub ? <dd className={cn("m-0 text-[11px]", cell.tone)}>{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
