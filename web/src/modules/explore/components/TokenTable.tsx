import { cn } from "@/shared/lib/cn";
import { formatInteger } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import type { RankedToken } from "../lib/filter";
import { TABLE_GRID, TokenRow } from "./TokenRow";

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

interface TokenTableProps {
  rows: RankedToken[];
  totalTokens: number;
  panelId: string;
  labelledBy: string;
  onReset?: () => void;
}

/** The wide token table. It scrolls sideways inside its own box. */
export function TokenTable({ rows, totalTokens, panelId, labelledBy, onReset }: TokenTableProps) {
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="overflow-x-auto rounded-[20px] border border-line bg-surface shadow-panel"
    >
      <div className="min-w-[1268px] p-2">
        <div role="table" aria-label="Tokens" aria-rowcount={rows.length + 1}>
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
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
            <span className="text-[15px] font-semibold">No tokens match these filters</span>
            <span className="text-[13px] text-text-2">Try another chain or launchpad, or clear the search.</span>
            <Button variant="secondary" size="sm" onClick={onReset}>
              Reset filters
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-2.5 pb-1.5">
          <span className="text-[12px] text-text-3" aria-live="polite">
            Showing {rows.length} of {formatInteger(totalTokens)} tokens · refreshes every 4s
          </span>
          <Button variant="secondary" size="md">
            Load more
          </Button>
        </div>
      </div>
    </div>
  );
}
