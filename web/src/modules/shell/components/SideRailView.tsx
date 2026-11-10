"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "../hooks/useTheme";
import { MAIN_NAV, type NavId, RESOURCE_NAV, UTILITY_NAV } from "../lib/nav";
import { Logo } from "./Logo";
import { RailItem } from "./RailItem";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeIcon } from "./ThemeToggle";

interface SideRailViewProps {
  activeId: NavId | null;
  unreadAlerts: number;
  /** False on token pages, whose Buy / Sell bar takes the phone tab bar's place. */
  phoneTabs?: boolean;
}

/** On phones the groups dissolve so every tab is an equal slot in one bar. */
const GROUP = "flex w-full flex-col items-center gap-1 max-md:contents";
/** "Workspace" / "Resources": only in the wide sidebar. */
const SECTION = "hidden w-full px-3 text-[10px] font-medium tracking-[0.12em] text-text-3 uppercase xl:block";

/**
 * The sticky sidebar: a 76 px icon rail from 768 px that widens to 192 px with
 * the wordmark, section labels and inline labels from 1280 px, with Theme and
 * More pinned to the bottom. Under 768 px it becomes a fixed tab bar along the
 * bottom edge; the logo moves into the top bar. Theme flips light/dark; More
 * opens Settings (wallet, theme and language).
 */
export function SideRailView({ activeId, unreadAlerts, phoneTabs = true }: SideRailViewProps) {
  const { t, href } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeItem, moreItem] = UTILITY_NAV;

  return (
    <>
      <nav
        aria-label={t.nav.main}
        className={cn(
          "z-40 flex flex-col items-center gap-3 border-r border-line bg-bg-deep px-2 py-4",
          "md:sticky md:top-0 md:h-dvh md:w-[76px] md:flex-none xl:w-48 xl:px-3",
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:flex-row max-md:items-stretch max-md:gap-0 max-md:border-t max-md:border-r-0 max-md:bg-bg-deep/94 max-md:px-1 max-md:pt-1 max-md:pb-[calc(4px+env(safe-area-inset-bottom))] max-md:backdrop-blur-md",
          !phoneTabs && "max-md:hidden",
        )}
      >
        <Link
          href={href("/")}
          aria-label={t.nav.home}
          className="mb-5 flex h-10 flex-none items-center gap-2.5 rounded-lg xl:w-full xl:px-1 max-md:hidden"
        >
          <Logo size={34} />
          <span className="hidden font-display text-[20px] leading-none font-extrabold tracking-[-0.04em] whitespace-nowrap xl:inline">
            tonkfun.fun
          </span>
        </Link>
        <span className={SECTION}>{t.nav.workspace}</span>
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
        <span className={cn(SECTION, "mt-5")}>{t.nav.resources}</span>
        <div className={GROUP}>
          {RESOURCE_NAV.map((item) => (
            <RailItem key={item.id} item={item} active={item.id === activeId} />
          ))}
        </div>
        <div className="flex-auto max-md:hidden" />
        <div className={GROUP}>
          <RailItem
            item={themeItem}
            active={false}
            icon={<ThemeIcon size={20} />}
            buttonProps={{
              "aria-label": theme === "light" ? t.prefs.toDark : t.prefs.toLight,
              onClick: toggleTheme,
            }}
          />
          <RailItem
            item={moreItem}
            active={settingsOpen}
            buttonProps={{
              "aria-haspopup": "dialog",
              "aria-expanded": settingsOpen,
              onClick: () => setSettingsOpen(true),
            }}
          />
        </div>
      </nav>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
