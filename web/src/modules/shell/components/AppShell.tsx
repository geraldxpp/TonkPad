import { type ReactNode, Suspense } from "react";
import { isLiveMode } from "@/shared/live/server";
import type { ShellData } from "../data/shell.mock";
import { ShellLiveProvider } from "../live/ShellLive";
import { SideRail } from "./SideRail";
import { SideRailView } from "./SideRailView";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

interface AppShellProps {
  data: ShellData;
  children: ReactNode;
}

/**
 * Sidebar + main column + status bar on the graphite --bg. In live mode the
 * ticker, chain counts and status bar refresh from the worker.
 */
export function AppShell({ data, children }: AppShellProps) {
  return (
    <ShellLiveProvider live={isLiveMode()}>
      <div className="relative flex min-h-screen items-stretch overflow-clip bg-bg font-sans text-[14px] text-text">
        <Suspense fallback={<SideRailView activeId={null} unreadAlerts={data.unreadAlerts} />}>
          <SideRail unreadAlerts={data.unreadAlerts} />
        </Suspense>
        {/* On phones the rail is a fixed bottom tab bar, so leave room for it. */}
        <div className="relative z-[1] flex min-w-0 flex-1 flex-col max-md:pb-[calc(64px+env(safe-area-inset-bottom))]">
          <TopBar data={data} />
          {/* Centred up to 1600 px, in line with the top bar and the footer. */}
          <main className="mx-auto flex w-full max-w-[1600px] flex-auto flex-col gap-7 px-4 py-6 md:p-7">
            {children}
          </main>
          <StatusBar status={data.status} />
        </div>
      </div>
    </ShellLiveProvider>
  );
}
