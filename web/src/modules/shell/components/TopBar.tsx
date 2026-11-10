import { Bell } from "lucide-react";
import { Suspense } from "react";
import { getI18n } from "@/shared/i18n/server";
import { IconButton } from "@/shared/ui/IconButton";
import type { ShellData } from "../data/shell.mock";
import { ChainFilter } from "./ChainFilter";
import { ChainTrigger } from "./ChainTrigger";
import { LanguageMenu } from "./LanguageMenu";
import { MobileBrand } from "./MobileBrand";
import { SearchBox } from "./SearchBox";
import { SearchField } from "./SearchField";
import { SearchToggle } from "./SearchToggle";
import { ThemeToggle } from "./ThemeToggle";
import { TickerTape } from "./TickerTape";
import { WalletButton } from "./WalletButton";

interface TopBarProps {
  data: ShellData;
}

/**
 * Search, chain filter, language, theme, alerts and wallet in a centred row,
 * with the live ticker in its own strip below. The URL-bound controls render
 * inside Suspense: the static shell carries their default look and the
 * request-time render fills in the URL's values.
 *
 * Under 768 px it becomes a sticky one-row bar (logo, search toggle,
 * language, theme, alerts, wallet); the ticker strip scrolls away below it
 * and the chain filter moves into the token list's toolbar. To keep that
 * one row with "Connect wallet" in full on any phone, the bar uses 32 px
 * icon buttons with 16 px icons, a 28 px logo (the wordmark returns from
 * 640 px), a globe-only language button and 4 px gaps, and the wallet button
 * can't wrap (see WalletButton). Languages whose phrase is much longer than
 * English use their short "Connect" (the `connect` message).
 */
export async function TopBar({ data }: TopBarProps) {
  const { t } = await getI18n();
  return (
    <>
      <header className="relative z-[5] border-b border-line bg-bg/95 max-md:sticky max-md:top-0 max-md:z-30 max-md:backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-1 px-4 py-2.5 md:flex-nowrap md:gap-2.5 md:px-7 md:py-4">
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
          <Suspense
            fallback={
              <div className="relative flex-none max-md:hidden">
                <ChainTrigger value="all" aria-expanded={false} />
              </div>
            }
          >
            <ChainFilter counts={data.chainCounts} className="flex-none max-md:hidden" />
          </Suspense>
          <LanguageMenu />
          <ThemeToggle className="max-md:size-8" />
          <IconButton
            label={t.header.alerts}
            size={40}
            className="max-md:size-8 md:rounded-lg md:border-transparent md:bg-transparent md:hover:bg-raised"
          >
            <Bell size={18} strokeWidth={1.8} className="max-md:size-4" />
            <span className="absolute top-[9px] right-[9px] size-1.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg)] max-md:top-[6px] max-md:right-[6px]" />
          </IconButton>
          <WalletButton />
        </div>
      </header>
      <div className="border-b border-line bg-bg-deep/45">
        <div className="mx-auto flex w-full max-w-[1600px] items-center px-2 md:px-7">
          <TickerTape items={data.tape} label={t.header.ticker} />
        </div>
      </div>
    </>
  );
}
