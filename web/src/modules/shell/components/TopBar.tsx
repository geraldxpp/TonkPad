import { Bell, Wallet } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import type { ShellData } from "../data/shell.mock";
import { ChainFilter } from "./ChainFilter";
import { ChainTrigger } from "./ChainTrigger";
import { SearchBox } from "./SearchBox";
import { SearchField } from "./SearchField";
import { TickerTape } from "./TickerTape";

interface TopBarProps {
  data: ShellData;
}

/**
 * Search, live ticker, chain filter, alerts and wallet. The two URL-bound
 * controls render inside Suspense: the static shell carries their default
 * look and the request-time render fills in the URL's values.
 */
export function TopBar({ data }: TopBarProps) {
  return (
    <header className="relative z-[5] flex flex-wrap items-center gap-3 border-b border-line bg-[rgba(7,8,13,0.86)] px-[clamp(16px,2vw,24px)] py-3">
      <Suspense fallback={<SearchBox />}>
        <SearchField />
      </Suspense>
      <TickerTape items={data.tape} />
      <Suspense
        fallback={
          <div className="relative max-md:ml-auto">
            <ChainTrigger value="all" aria-expanded={false} />
          </div>
        }
      >
        <ChainFilter counts={data.chainCounts} />
      </Suspense>
      <IconButton label="Alerts" size={40}>
        <Bell size={18} strokeWidth={1.8} />
        <span className="absolute top-[9px] right-[9px] size-2 rounded-full bg-accent shadow-[0_0_0_2px_#0D0F17]" />
      </IconButton>
      <Button variant="cta" size="md" aria-label="Connect wallet">
        <Wallet size={16} strokeWidth={2} />
        <span className="max-[479px]:hidden">Connect wallet</span>
      </Button>
    </header>
  );
}
