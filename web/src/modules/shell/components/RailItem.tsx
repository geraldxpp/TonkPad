import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import type { NavItem } from "../lib/nav";

interface RailItemProps {
  item: NavItem;
  active: boolean;
  /** Red count badge (Alerts). */
  badge?: number;
}

/** 60 × 58 rail tile on desktop; an evenly sized tab in the phone tab bar. */
const ITEM =
  "relative flex h-[58px] w-[60px] flex-none flex-col items-center justify-center gap-1 rounded-[14px] max-md:h-14 max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:gap-0.5 max-md:rounded-xl";

export function RailItem({ item, active, badge }: RailItemProps) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon size={20} strokeWidth={1.8} />
      <span
        className={cn(
          "text-[11px] font-semibold tracking-[0.02em] max-md:text-[10px] max-md:tracking-normal",
          active ? "text-text" : "text-text-3",
        )}
      >
        {item.label}
      </span>
      {badge ? (
        <span className="absolute left-[34px] top-[5px] h-4 min-w-4 rounded-lg bg-neg px-1 text-center text-[10px] leading-4 font-bold text-[var(--badge-on-alert)]">
          {badge}
        </span>
      ) : null}
    </>
  );

  const tone = active
    ? "bg-[rgba(140,123,255,0.14)] text-accent-text max-md:bg-transparent"
    : "bg-transparent text-text-2";
  const className = cn(ITEM, tone, item.hideOnMobile && "max-md:hidden");

  if (item.href) {
    return (
      <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
        {body}
      </Link>
    );
  }
  const label = badge ? `${item.label}, ${badge} new` : undefined;
  return (
    <button type="button" aria-label={label} className={className}>
      {body}
    </button>
  );
}
