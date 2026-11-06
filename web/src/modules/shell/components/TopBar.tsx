import { Bell, Wallet } from "lucide-react";
import { Suspense } from "react";
import { getI18n } from "@/shared/i18n/server";
import { Button } from "@/shared/ui/Button";
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

interface TopBarProps {
  data: ShellData;
}

/**
 * The wallet button on phones. Its flex basis is 0, so it can never push the
 * row into wrapping: it grows up to its full label and, if a big system font
 * leaves too little room, the label ends in an ellipsis instead. Under 340 px
 * it is a 32 px wallet icon. (The 340 px split uses ranges so no two
 * breakpoints set the same property.)
 */
const PHONE_CTA = [
  "max-md:h-8 max-md:min-w-0 max-md:flex-[1_1_0%] max-md:text-[13px]",
  "min-[340px]:max-md:max-w-max min-[340px]:max-md:px-3",
  "max-[339px]:max-w-8 max-[339px]:px-0",
].join(" ");

/**
 * Search, live ticker, chain filter, language, theme, alerts and wallet. The
 * URL-bound controls render inside Suspense: the static shell carries their
 * default look and the request-time render fills in the URL's values.
 *
 * Under 768 px it becomes a sticky one-row bar (logo, search toggle,
 * language, theme, alerts, wallet); the ticker sits just below it and scrolls
 * away and the chain filter moves into the token list's toolbar. To keep that
 * one row with "Connect wallet" in full on any phone, the bar uses 32 px
 * icon buttons with 16 px icons, a 28 px logo (the wordmark returns from
 * 640 px), a globe-only language button and 4 px gaps, and the wallet button
 * can't wrap (see PHONE_CTA). Languages whose phrase is much longer than
 * English use their short "Connect" (the `connect` message).
 */
export async function TopBar({ data }: TopBarProps) {
  const { t } = await getI18n();
  return (
    <>
      <header className="relative z-[5] flex flex-wrap items-center gap-1 border-b border-line bg-bg/86 px-[clamp(16px,2vw,24px)] py-3 max-md:sticky max-md:top-0 max-md:z-30 max-md:py-2.5 max-md:backdrop-blur-md md:gap-3">
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
        <TickerTape items={data.tape} label={t.header.ticker} className="max-md:hidden" />
        <Suspense
          fallback={
            <div className="relative max-md:hidden">
              <ChainTrigger value="all" aria-expanded={false} />
            </div>
          }
        >
          <ChainFilter counts={data.chainCounts} className="max-md:hidden" />
        </Suspense>
        <LanguageMenu />
        <ThemeToggle className="max-md:size-8" />
        <IconButton label={t.header.alerts} size={40} className="max-md:size-8">
          <Bell size={18} strokeWidth={1.8} className="max-md:size-4" />
          <span className="absolute top-[9px] right-[9px] size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--surface)] max-md:top-[6px] max-md:right-[6px]" />
        </IconButton>
        <Button variant="cta" size="md" aria-label={t.header.connectWallet} className={PHONE_CTA}>
          <Wallet size={16} strokeWidth={2} className="hidden max-[339px]:block md:block" />
          <span className="max-md:hidden">{t.header.connectWallet}</span>
          <span className="min-w-0 truncate md:hidden max-[339px]:hidden">{t.header.connect}</span>
        </Button>
      </header>
      <div className="border-b border-line px-2 md:hidden">
        <TickerTape items={data.tape} label={t.header.ticker} />
      </div>
    </>
  );
}
