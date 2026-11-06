"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import type { NavItem } from "../lib/nav";

interface RailItemProps {
  item: NavItem;
  active: boolean;
  /** Red count badge (Alerts). */
  badge?: number;
  /** Replaces the item's icon (Theme swaps a sun for a moon). */
  icon?: ReactNode;
  /** Behaviour for items without an href (Theme, More). */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}

/**
 * 60 × 58 rail tile on desktop; an evenly sized tab in the phone tab bar.
 * Labels in long languages tighten a touch under 375 px and truncate as a
 * last resort.
 */
const ITEM =
  "relative flex h-[58px] w-[60px] flex-none flex-col items-center justify-center gap-1 rounded-[14px] max-md:h-14 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:gap-0.5 max-md:rounded-xl";

export function RailItem({ item, active, badge, icon, buttonProps }: RailItemProps) {
  const { t, href } = useI18n();
  const Icon = item.icon;
  const label = t.nav[item.id];
  const body = (
    <>
      {icon ?? <Icon size={20} strokeWidth={1.8} />}
      <span
        className={cn(
          "max-w-full truncate text-[10px] font-semibold max-[374px]:tracking-[-0.02em] md:text-[11px] md:tracking-[0.02em]",
          active ? "text-text" : "text-text-3",
        )}
      >
        {label}
      </span>
      {badge ? (
        <span className="absolute left-[34px] top-[5px] h-4 min-w-4 rounded-lg bg-neg px-1 text-center text-[10px] leading-4 font-bold text-[var(--badge-on-alert)]">
          {badge}
        </span>
      ) : null}
    </>
  );

  const tone = active
    ? "bg-accent/14 text-accent-text max-md:bg-transparent"
    : "bg-transparent text-text-2";
  const className = cn(ITEM, tone, item.hideOnMobile && "max-md:hidden");

  if (item.href) {
    return (
      <Link href={href(item.href)} aria-current={active ? "page" : undefined} className={className}>
        {body}
      </Link>
    );
  }
  const ariaLabel = badge ? fmt(t.nav.alertsNew, { count: badge }) : undefined;
  return (
    <button type="button" aria-label={ariaLabel} {...buttonProps} className={className}>
      {body}
    </button>
  );
}
