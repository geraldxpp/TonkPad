"use client";

import { usePathname } from "next/navigation";
import { activeNavId } from "../lib/nav";
import { SideRailView } from "./SideRailView";

interface SideRailProps {
  unreadAlerts: number;
}

/** Highlights the rail item for the current route. */
export function SideRail({ unreadAlerts }: SideRailProps) {
  const pathname = usePathname();
  return <SideRailView activeId={activeNavId(pathname)} unreadAlerts={unreadAlerts} />;
}
