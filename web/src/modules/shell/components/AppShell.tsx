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
 * Rail + main column + status bar on --bg, with the blue and green glows. In
 * live mode the ticker, chain counts and status bar refresh from the worker.
 */
export function AppShell({ data, children }: AppShellProps) {
  return (
    <ShellLiveProvider live={isLiveMode()}>
      <div className="relative flex min-h-screen flex-wrap items-stretch overflow-clip bg-bg font-sans text-[14px] text-text">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[330px] -left-[120px] h-[820px] w-[1200px] bg-[radial-gradient(closest-side,var(--glow-accent),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[280px] -right-[160px] h-[640px] w-[900px] bg-[radial-gradient(closest-side,var(--glow-neon),transparent)]"
        />
        <Suspense fallback={<SideRailView activeId={null} unreadAlerts={data.unreadAlerts} />}>
          <SideRail unreadAlerts={data.unreadAlerts} />
        </Suspense>
        {/* On phones the rail is a fixed bottom tab bar, so leave room for it. */}
        <div className="relative z-[1] flex min-w-0 flex-[999_1_560px] flex-col max-md:pb-[calc(64px+env(safe-area-inset-bottom))]">
          <TopBar data={data} />
          {/* Fills the window on wide screens (no max width), like the reference app. */}
          <main className="flex w-full flex-auto flex-col gap-14 px-[clamp(16px,3vw,40px)] pt-8 pb-14 max-md:gap-9 max-md:pt-6 max-md:pb-10">
            {children}
          </main>
          <StatusBar status={data.status} />
        </div>
      </div>
    </ShellLiveProvider>
  );
}
