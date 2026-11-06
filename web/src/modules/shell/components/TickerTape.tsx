"use client";

import { cn } from "@/shared/lib/cn";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import { TokenArt } from "@/shared/ui/TokenArt";
import type { TapeItem } from "../data/shell.mock";
import { useShellLive } from "../live/ShellLive";

interface TickerTapeProps {
  items: readonly TapeItem[];
  className?: string;
}

interface TickerTapeLabelProps extends TickerTapeProps {
  /** Accessible name of the marquee ("Live ticker"). */
  label: string;
}

function TapeRun({ items, hidden }: TickerTapeProps & { hidden?: boolean }) {
  return (
    <div className="flex flex-none items-center gap-[22px] pr-[22px]" aria-hidden={hidden} inert={hidden}>
      {items.map((item) => (
        <span key={item.address ?? item.ticker} className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap">
          <TokenArt src={item.art} label={item.ticker} size={20} eager className="size-5 rounded-md" />
          <span className="text-[12px] font-semibold">{item.ticker}</span>
          <span className="font-mono text-[12px] text-text-2">{formatUsdCompact(item.marketCap)}</span>
          <span className={item.change24h >= 0 ? "font-mono text-[12px] font-medium text-pos" : "font-mono text-[12px] font-medium text-neg"}>
            {formatChange(item.change24h)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Right-to-left marquee. The list renders twice and slides by -50% for a
 * seamless loop; hover or keyboard focus pauses it. The edges fade out. In live
 * mode it shows the worker's busiest tokens instead of `items`.
 */
export function TickerTape({ items: mockItems, label, className }: TickerTapeLabelProps) {
  const shell = useShellLive();
  const items = shell.live ? (shell.data?.tape ?? []) : mockItems;
  return (
    <div
      role="marquee"
      aria-label={label}
      tabIndex={0}
      className={cn("tk-tape h-10 min-w-0 flex-[999_1_260px] rounded-lg", className)}
    >
      <div className="h-full overflow-hidden px-2 [mask-image:linear-gradient(90deg,transparent,#000_28px,#000_calc(100%-28px),transparent)]">
        <div className="tk-marquee flex h-full w-max items-center">
          <TapeRun items={items} />
          <TapeRun items={items} hidden />
        </div>
      </div>
    </div>
  );
}
