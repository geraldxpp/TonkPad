import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import type { RankedToken } from "../lib/filter";
import type { Timeframe } from "../lib/view";
import { COLUMN_VISIBILITY, TABLE_GRID, TokenRow } from "./TokenRow";
import { COMPACT_GRID, TokenRowCompact } from "./TokenRowCompact";

type Header = readonly [key: string, label: (t: Dictionary, tf: Timeframe) => string, className: string];

/** The change column follows the timeframe; 24h keeps its translated label. */
const changeLabel = (t: Dictionary, tf: Timeframe) => (tf === "24h" ? t.table.change24h : tf);

const HEADERS: readonly Header[] = [
  ["rank", () => "#", ""],
  ["token", (t) => t.table.token, ""],
  ["curve", (t) => t.table.curve, COLUMN_VISIBILITY.curve],
  ["score", (t) => t.table.score, COLUMN_VISIBILITY.score],
  ["spark", (t) => t.table.last24h, COLUMN_VISIBILITY.spark],
  ["change", changeLabel, "text-right"],
  ["volume", (t) => t.table.volume, `text-right ${COLUMN_VISIBILITY.volume}`],
  ["holders", (t) => t.table.holders, `text-right ${COLUMN_VISIBILITY.holders}`],
  ["smart", (t) => t.table.smart, `pl-1.5 ${COLUMN_VISIBILITY.smart}`],
  ["mcap", (t) => t.table.marketCap, "text-right"],
  ["open", (t) => t.table.details, "text-right"],
];

const COMPACT_HEADERS: readonly Header[] = [
  ["token", (t) => t.table.token, ""],
  ["mcap", (t) => t.table.marketCap, "text-right whitespace-nowrap"],
  ["change", changeLabel, "text-right"],
  ["open", (t) => t.table.details, "sr-only"],
];

interface TokenTableProps {
  rows: RankedToken[];
  tf: Timeframe;
  totalTokens: number;
  panelId: string;
  labelledBy: string;
  onReset?: () => void;
  /** True while a new view's rows are loading; the current rows dim. */
  busy?: boolean;
  onLoadMore?: () => void;
  /** False hides Load more (the live list has shown every match). */
  hasMore?: boolean;
  /** Live list: the latest refresh failed, so these rows are the last ones that arrived (or none). */
  stale?: boolean;
}

/**
 * The token list, the bottom of the "Explore tokens" card. From 768 px it is
 * the full table, which drops its lower-priority columns on narrower screens
 * (see TABLE_GRID); on phones it is a compact four-column list (Token, Market
 * cap, 24h, Open). Only one of the two is ever displayed, so assistive tech
 * sees a single "Tokens" table.
 */
export function TokenTable(props: TokenTableProps) {
  const { rows, tf, totalTokens, panelId, labelledBy, onReset, busy = false, onLoadMore, hasMore = true, stale = false } = props;
  const { t } = useI18n();
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      className="min-w-0 overflow-x-auto"
    >
      <div className={cn("transition-opacity duration-200", busy && "opacity-60")}>
        <div role="table" aria-label={t.table.label} aria-rowcount={rows.length + 1} data-variant="table" className="max-md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(TABLE_GRID, "h-10 bg-bg/20 px-4 text-[11px] font-medium text-text-3")}>
              {HEADERS.map(([key, label, align]) => (
                <span key={key} role="columnheader" className={cn("min-w-0 truncate", align)}>
                  {label(t, tf)}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((token) => (
              <TokenRow key={token.address} token={token} tf={tf} />
            ))}
          </div>
        </div>
        <div role="table" aria-label={t.table.label} aria-rowcount={rows.length + 1} data-variant="list" className="md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(COMPACT_GRID, "h-10 bg-bg/20 px-3 text-[11px] text-text-3")}>
              {COMPACT_HEADERS.map(([key, label, align]) => (
                <span key={key} role="columnheader" className={cn("min-w-0 truncate", align)}>
                  {label(t, tf)}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((token) => (
              <TokenRowCompact key={token.address} token={token} tf={tf} />
            ))}
          </div>
        </div>
        {rows.length === 0 && !busy && stale ? (
          <div role="status" className="flex flex-col items-center px-4 py-12 text-center">
            <span className="text-[15px] font-semibold">{t.live.offline}</span>
          </div>
        ) : null}
        {rows.length === 0 && !busy && !stale ? (
          <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
            <span className="text-[15px] font-semibold">{t.table.emptyTitle}</span>
            <span className="text-[13px] text-text-2">{t.table.emptyHint}</span>
            <Button variant="secondary" size="sm" onClick={onReset}>
              {t.table.reset}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/20 px-4 py-3.5 max-md:px-3">
          <span className={cn("text-[12px]", stale ? "text-warn" : "text-text-3")} aria-live="polite">
            {fmt(stale ? t.table.paused : t.table.showing, { shown: rows.length, total: formatInteger(totalTokens) })}
          </span>
          {hasMore ? (
            <Button variant="secondary" size="sm" className="rounded-md max-md:w-full" onClick={onLoadMore}>
              {t.table.loadMore}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
