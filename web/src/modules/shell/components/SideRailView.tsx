import Link from "next/link";
import { MAIN_NAV, UTILITY_NAV } from "../lib/nav";
import { Logo } from "./Logo";
import { RailItem } from "./RailItem";

interface SideRailViewProps {
  activeId: string | null;
  unreadAlerts: number;
}

/** On phones the groups dissolve so every tab is an equal slot in one bar. */
const GROUP = "flex w-full flex-wrap justify-center gap-1.5 max-md:contents";

/**
 * 76 px rail with the logo, the main screens and Theme/More pinned to the
 * bottom. Under 768 px it becomes a fixed tab bar along the bottom edge; the
 * logo moves into the top bar.
 */
export function SideRailView({ activeId, unreadAlerts }: SideRailViewProps) {
  return (
    <nav
      aria-label="Main"
      className="relative z-[2] flex flex-[1_1_76px] flex-col items-center gap-3.5 border-r border-line bg-bg-deep px-2 py-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:flex-row max-md:items-stretch max-md:gap-0 max-md:border-r-0 max-md:border-t max-md:bg-[rgba(5,6,10,0.94)] max-md:px-1 max-md:pt-1 max-md:pb-[calc(4px+env(safe-area-inset-bottom))] max-md:backdrop-blur-md"
    >
      <Link href="/" aria-label="Tonkpad.fun home" className="flex flex-none rounded-full max-md:hidden">
        <Logo />
      </Link>
      <div className={GROUP}>
        {MAIN_NAV.map((item) => (
          <RailItem
            key={item.id}
            item={item}
            active={item.id === activeId}
            badge={item.id === "alerts" ? unreadAlerts : undefined}
          />
        ))}
      </div>
      <div className="flex-auto max-md:hidden" />
      <div className={GROUP}>
        {UTILITY_NAV.map((item) => (
          <RailItem key={item.id} item={item} active={false} />
        ))}
      </div>
    </nav>
  );
}
