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
 * A 60 × 58 icon tile in the 76 px rail (768–1279 px), a full-width row with
 * the label beside the icon in the 192 px sidebar from 1280 px, and an evenly
 * sized tab in the phone tab bar. Labels in long languages tighten a touch
 * under 375 px and truncate as a last resort.
 */
const ITEM = [
  "relative flex h-[58px] w-[60px] flex-none flex-col items-center justify-center gap-1 rounded-lg",
  "xl:h-11 xl:w-full xl:flex-row xl:justify-start xl:gap-3 xl:px-3",
  "max-md:h-14 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:gap-0.5 max-md:rounded-xl",
].join(" ");

export function RailItem({ item, active, badge, icon, buttonProps }: RailItemProps) {
  const { t, href } = useI18n();
  const Icon = item.icon;
  const label = t.nav[item.id];
  const body = (
    <>
      {/* The active item's accent bar: on the left edge in the rail, along the top in the phone tab bar. */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-accent max-md:top-0 max-md:bottom-auto max-md:left-1/2 max-md:h-0.5 max-md:w-5 max-md:-translate-x-1/2"
        />
      ) : null}
      {icon ?? <Icon size={20} strokeWidth={1.8} className="flex-none" />}
      <span
        className={cn(
          "max-w-full truncate text-[10px] font-semibold max-[374px]:tracking-[-0.02em] md:text-[11px] md:tracking-[0.02em]",
          "xl:min-w-0 xl:text-[13px] xl:font-medium xl:tracking-normal",
          active ? "text-text" : "text-text-3",
        )}
      >
        {label}
      </span>
      {badge ? (
        <span className="absolute top-[5px] left-[34px] h-4 min-w-4 rounded bg-neg px-1 text-center font-mono text-[10px] leading-4 font-semibold text-[var(--badge-on-alert)] xl:static xl:ml-auto">
          {badge}
        </span>
      ) : null}
    </>
  );

  const tone = active
    ? "bg-accent/10 text-accent-text max-md:bg-transparent"
    : "bg-transparent text-text-2 hover:bg-raised hover:text-text";
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
