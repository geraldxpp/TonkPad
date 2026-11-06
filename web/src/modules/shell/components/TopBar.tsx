import { Bell, Wallet } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import type { ShellData } from "../data/shell.mock";
import { ChainFilter } from "./ChainFilter";
import { ChainTrigger } from "./ChainTrigger";
import { MobileBrand } from "./MobileBrand";
import { SearchBox } from "./SearchBox";
import { SearchField } from "./SearchField";
import { SearchToggle } from "./SearchToggle";
import { TickerTape } from "./TickerTape";

interface TopBarProps {
  data: ShellData;
}

/**
 * Search, live ticker, chain filter, alerts and wallet. The URL-bound controls
 * render inside Suspense: the static shell carries their default look and the
 * request-time render fills in the URL's values.
 *
 * Under 768 px it becomes a sticky one-row bar (logo, search toggle, alerts,
 * wallet); the ticker sits just below it and scrolls away, and the chain
 * filter moves into the token list's toolbar.
 */
export function TopBar({ data }: TopBarProps) {
  return (
    <>
      <header className="relative z-[5] flex flex-wrap items-center gap-3 border-b border-line bg-[rgba(7,8,13,0.86)] px-[clamp(16px,2vw,24px)] py-3 max-md:sticky max-md:top-0 max-md:z-30 max-md:gap-2 max-md:py-2.5 max-md:backdrop-blur-md">
        <MobileBrand />
        <Suspense
          fallback={
            <>
              <SearchToggle open={false} />
              <SearchBox />
            </>
          }
        >
          <SearchField />
        </Suspense>
        <TickerTape items={data.tape} className="max-md:hidden" />
        <Suspense
          fallback={
            <div className="relative max-md:hidden">
              <ChainTrigger value="all" aria-expanded={false} />
            </div>
          }
        >
          <ChainFilter counts={data.chainCounts} className="max-md:hidden" />
        </Suspense>
        <IconButton label="Alerts" size={40}>
          <Bell size={18} strokeWidth={1.8} />
          <span className="absolute top-[9px] right-[9px] size-2 rounded-full bg-accent shadow-[0_0_0_2px_#0D0F17]" />
        </IconButton>
        <Button variant="cta" size="md" aria-label="Connect wallet" className="max-md:px-3">
          <Wallet size={16} strokeWidth={2} />
          <span className="max-md:hidden">Connect wallet</span>
          <span className="md:hidden">Connect</span>
        </Button>
      </header>
      <div className="border-b border-line px-2 md:hidden">
        <TickerTape items={data.tape} />
      </div>
    </>
  );
}
