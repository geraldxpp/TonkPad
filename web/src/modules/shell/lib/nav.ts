import {
  ArrowRightLeft,
  Bell,
  BookOpen,
  Compass,
  Ellipsis,
  type LucideIcon,
  Radar,
  Rocket,
  Sun,
  Wallet,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Items without an href are UI-only buttons for now. */
  href?: string;
  /**
   * Left out of the phone tab bar: Alerts lives on the header bell there and
   * Theme is UI-only, which keeps the bar to seven tabs.
   */
  hideOnMobile?: boolean;
}

export const MAIN_NAV: readonly NavItem[] = [
  { id: "explore", label: "Explore", icon: Compass, href: "/" },
  { id: "live", label: "Live", icon: Radar, href: "/live" },
  { id: "bridge", label: "Bridge", icon: ArrowRightLeft, href: "/bridge" },
  { id: "portfolio", label: "Portfolio", icon: Wallet, href: "/portfolio" },
  { id: "alerts", label: "Alerts", icon: Bell, hideOnMobile: true },
  { id: "launch", label: "Launch", icon: Rocket, href: "/launch" },
  { id: "docs", label: "Docs", icon: BookOpen, href: "/docs" },
];

export const UTILITY_NAV: readonly NavItem[] = [
  { id: "theme", label: "Theme", icon: Sun, hideOnMobile: true },
  { id: "more", label: "More", icon: Ellipsis },
];

/** The rail item that matches a pathname. Token pages highlight nothing. */
export function activeNavId(pathname: string): string | null {
  for (const item of MAIN_NAV) {
    if (!item.href) continue;
    if (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item.id;
    }
  }
  return null;
}
