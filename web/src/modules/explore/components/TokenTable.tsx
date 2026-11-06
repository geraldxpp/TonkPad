import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import type { RankedToken } from "../lib/filter";
import { TABLE_GRID, TokenRow } from "./TokenRow";
import { COMPACT_GRID, TokenRowCompact } from "./TokenRowCompact";

const HEADERS = [
  ["#", ""],
  ["Token", ""],
  ["Bonding curve", ""],
  ["Mission score", ""],
  ["Last 24h", ""],
  ["24h", "text-right"],
  ["Volume", "text-right"],
  ["Holders", "text-right"],
  ["Smart money", "pl-[18px]"],
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
 * The token list. From 768 px it is the design's 11-column table, which
 * scrolls sideways inside its box when space runs out; on phones it is a
 * compact four-column list (Token, Market cap, 24h, Quick buy). Only one of
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
      <div className="min-w-[1268px] p-2 max-md:min-w-0 max-[374px]:p-1">
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
