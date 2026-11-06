import Link from "next/link";
import { MAIN_NAV, UTILITY_NAV } from "../lib/nav";
import { Logo } from "./Logo";
import { RailItem } from "./RailItem";

interface SideRailViewProps {
  activeId: string | null;
  unreadAlerts: number;
}

const GROUP = "flex w-full flex-wrap justify-center gap-1.5 max-md:w-auto max-md:flex-nowrap";

/**
 * 76 px rail with the logo, the main screens and Theme/More pinned to the
 * bottom. Under 768 px it becomes a horizontal bar that scrolls on its own.
 */
export function SideRailView({ activeId, unreadAlerts }: SideRailViewProps) {
  return (
    <nav
      aria-label="Main"
      className="relative z-[2] flex flex-[1_1_76px] flex-col items-center gap-3.5 border-r border-line bg-bg-deep px-2 py-4 max-md:basis-full max-md:flex-row max-md:gap-2 max-md:overflow-x-auto max-md:border-r-0 max-md:border-b max-md:px-3 max-md:py-2 max-md:[scrollbar-width:none]"
    >
      <Link href="/" aria-label="Tonkpad.fun home" className="flex flex-none rounded-full">
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
      <div className="flex-auto" />
      <div className={GROUP}>
        {UTILITY_NAV.map((item) => (
          <RailItem key={item.id} item={item} active={false} />
        ))}
      </div>
    </nav>
  );
}
