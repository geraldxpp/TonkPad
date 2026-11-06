import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import type { RankedToken } from "../lib/filter";
import { COLUMN_VISIBILITY, TABLE_GRID, TokenRow } from "./TokenRow";
import { COMPACT_GRID, TokenRowCompact } from "./TokenRowCompact";

const HEADERS = [
  ["#", ""],
  ["Token", ""],
  ["Bonding curve", COLUMN_VISIBILITY.curve],
  ["Mission score", COLUMN_VISIBILITY.score],
  ["Last 24h", COLUMN_VISIBILITY.spark],
  ["24h", "text-right"],
  ["Volume", `text-right ${COLUMN_VISIBILITY.volume}`],
  ["Holders", `text-right ${COLUMN_VISIBILITY.holders}`],
  ["Smart money", `pl-[18px] ${COLUMN_VISIBILITY.smart}`],
  ["Market cap", "text-right"],
  ["Quick buy", "text-right"],
] as const;

const COMPACT_HEADERS = [
  ["Token", ""],
  ["Market cap", "text-right whitespace-nowrap"],
  ["24h", "text-right"],
  ["Quick buy", "sr-only"],
] as const;

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
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="overflow-x-auto rounded-[20px] border border-line bg-surface shadow-panel max-md:rounded-[18px]"
    >
      <div className="p-2 max-[374px]:p-1">
        <div role="table" aria-label="Tokens" aria-rowcount={rows.length + 1} data-variant="table" className="max-md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(TABLE_GRID, "h-10 px-3 text-[12px] text-text-3")}>
              {HEADERS.map(([label, align]) => (
                <span key={label} role="columnheader" className={align}>
                  {label}
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
        <div role="table" aria-label="Tokens" aria-rowcount={rows.length + 1} data-variant="list" className="md:hidden">
          <div role="rowgroup" className="border-b border-line">
            <div role="row" className={cn(COMPACT_GRID, "h-9 px-2 text-[12px] text-text-3")}>
              {COMPACT_HEADERS.map(([label, align]) => (
                <span key={label} role="columnheader" className={align}>
                  {label}
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
            <span className="text-[15px] font-semibold">No tokens match these filters</span>
            <span className="text-[13px] text-text-2">Try another chain or launchpad, or clear the search.</span>
            <Button variant="secondary" size="sm" onClick={onReset}>
              Reset filters
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-2.5 pb-1.5 max-md:px-2">
          <span className="text-[12px] text-text-3" aria-live="polite">
            Showing {rows.length} of {formatInteger(totalTokens)} tokens · refreshes every 4s
          </span>
          <Button variant="secondary" size="md" className="max-md:w-full">
            Load more
          </Button>
        </div>
      </div>
    </div>
  );
}
