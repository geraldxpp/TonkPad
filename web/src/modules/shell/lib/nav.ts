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
import { splitLocale } from "@/shared/i18n/config";

/** Rail items; each id is also its label's key in the `nav` messages. */
export type NavId = "explore" | "live" | "bridge" | "portfolio" | "alerts" | "launch" | "docs" | "theme" | "more";

export interface NavItem {
  id: NavId;
  icon: LucideIcon;
  /** Unprefixed app path; items without one are buttons (Alerts, Theme, More). */
  href?: string;
  /**
   * Left out of the phone tab bar: Alerts lives on the header bell there and
   * Theme sits in the More sheet, which keeps the bar to seven tabs.
   */
  hideOnMobile?: boolean;
}

export const MAIN_NAV: readonly NavItem[] = [
  { id: "explore", icon: Compass, href: "/" },
  { id: "live", icon: Radar, href: "/live" },
  { id: "bridge", icon: ArrowRightLeft, href: "/bridge" },
  { id: "portfolio", icon: Wallet, href: "/portfolio" },
  { id: "alerts", icon: Bell, hideOnMobile: true },
  { id: "launch", icon: Rocket, href: "/launch" },
  { id: "docs", icon: BookOpen, href: "/docs" },
];

export const UTILITY_NAV: readonly NavItem[] = [
  { id: "theme", icon: Sun, hideOnMobile: true },
  { id: "more", icon: Ellipsis },
];

/**
 * The rail item that matches a pathname, in any language ("/es/live" → live).
 * The prerendered English pages see "/en/…", the browser "/…"; both match.
 * Token pages highlight nothing.
 */
export function activeNavId(pathname: string): NavId | null {
  const { path } = splitLocale(pathname);
  for (const item of MAIN_NAV) {
    if (!item.href) continue;
    if (item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`)) {
      return item.id;
    }
  }
  return null;
}
