"use client";

import { usePathname } from "next/navigation";
import { isTestnetSite } from "@/shared/tonk/networks";
import { useWallet } from "@/shared/wallet/wallet";
import { activeNavId, isPortfolioPath, isTokenPath } from "../lib/nav";
import { SideRailView } from "./SideRailView";

/** Highlights the rail item for the current route, in any language; token pages, and Portfolio with a wallet, hide the phone tab bar. */
export function SideRail() {
  const pathname = usePathname();
  const { accounts } = useWallet();
  const portfolioDock = isPortfolioPath(pathname) && Object.keys(accounts).length > 0 && !isTestnetSite();
  return <SideRailView activeId={activeNavId(pathname)} phoneTabs={!isTokenPath(pathname) && !portfolioDock} />;
}
