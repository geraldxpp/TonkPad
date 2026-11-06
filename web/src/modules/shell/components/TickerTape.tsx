import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import type { TapeItem } from "../data/shell.mock";

interface TickerTapeProps {
  items: readonly TapeItem[];
  className?: string;
}

function TapeRun({ items, hidden }: TickerTapeProps & { hidden?: boolean }) {
  return (
    <div className="flex flex-none items-center gap-[22px] pr-[22px]" aria-hidden={hidden} inert={hidden}>
      {items.map((item) => (
        <span key={item.ticker} className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap">
          <Image src={item.art} alt="" width={20} height={20} loading="eager" className="size-5 rounded-md" />
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
 * seamless loop; hover or keyboard focus pauses it. The edges fade out.
 */
export function TickerTape({ items, className }: TickerTapeProps) {
  return (
    <div
      role="marquee"
      aria-label="Live ticker"
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
