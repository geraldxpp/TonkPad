import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import type { RankedToken } from "../lib/filter";
import { COLUMN_VISIBILITY, TABLE_GRID, TokenRow } from "./TokenRow";
import { COMPACT_GRID, TokenRowCompact } from "./TokenRowCompact";

type Header = readonly [key: string, label: (t: Dictionary) => string, className: string];

const HEADERS: readonly Header[] = [
  ["rank", () => "#", ""],
  ["token", (t) => t.table.token, ""],
  ["curve", (t) => t.table.curve, COLUMN_VISIBILITY.curve],
  ["score", (t) => t.table.score, COLUMN_VISIBILITY.score],
  ["spark", (t) => t.table.last24h, COLUMN_VISIBILITY.spark],
  ["change", (t) => t.table.change24h, "text-right"],
  ["volume", (t) => t.table.volume, `text-right ${COLUMN_VISIBILITY.volume}`],
  ["holders", (t) => t.table.holders, `text-right ${COLUMN_VISIBILITY.holders}`],
  ["smart", (t) => t.table.smart, `pl-[18px] ${COLUMN_VISIBILITY.smart}`],
  ["mcap", (t) => t.table.marketCap, "text-right"],
  ["buy", (t) => t.table.quickBuy, "text-right"],
];

const COMPACT_HEADERS: readonly Header[] = [
  ["token", (t) => t.table.token, ""],
  ["mcap", (t) => t.table.marketCap, "text-right whitespace-nowrap"],
  ["change", (t) => t.table.change24h, "text-right"],
  ["buy", (t) => t.table.quickBuy, "sr-only"],
];

interface TokenTableProps {
  rows: RankedToken[];
  totalTokens: number;
  panelId: string;
  labelledBy: string;
  onReset?: () => void;
}

/**
 * The token list. From 768 px it is the design's table, which drops its
 * lower-priority columns on narrower screens (see TABLE_GRID); on phones it is
 * a compact four-column list (Token, Market cap, 24h, Quick buy). Only one of
 * the two is ever displayed, so assistive tech sees a single "Tokens" table.
 */
export function TokenTable({ rows, totalTokens, panelId, labelledBy, onReset }: TokenTableProps) {
  const { t } = useI18n();
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="overflow-x-auto rounded-[20px] border border-line bg-surface shadow-panel max-md:rounded-[18px]"
    >
      <div className="p-2 max-[374px]:p-1">
        <div role="table" aria-label={t.table.label} aria-rowcount={rows.length + 1} data-variant="table" className="max-md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(TABLE_GRID, "h-10 px-3 text-[12px] text-text-3")}>
              {HEADERS.map(([key, label, align]) => (
                <span key={key} role="columnheader" className={align}>
                  {label(t)}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((token) => (
              <TokenRow key={token.ticker} token={token} />
            ))}
          </div>
        </div>
        <div role="table" aria-label={t.table.label} aria-rowcount={rows.length + 1} data-variant="list" className="md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(COMPACT_GRID, "h-9 px-2 text-[12px] text-text-3")}>
              {COMPACT_HEADERS.map(([key, label, align]) => (
                <span key={key} role="columnheader" className={align}>
                  {label(t)}
                </span>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {rows.map((token) => (
              <TokenRowCompact key={token.ticker} token={token} />
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
            <span className="text-[15px] font-semibold">{t.table.emptyTitle}</span>
            <span className="text-[13px] text-text-2">{t.table.emptyHint}</span>
            <Button variant="secondary" size="sm" onClick={onReset}>
              {t.table.reset}
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-2.5 pb-1.5 max-md:px-2">
          <span className="text-[12px] text-text-3" aria-live="polite">
            {fmt(t.table.showing, { shown: rows.length, total: formatInteger(totalTokens) })}
          </span>
          <Button variant="secondary" size="md" className="max-md:w-full">
            {t.table.loadMore}
          </Button>
        </div>
      </div>
    </div>
  );
}
