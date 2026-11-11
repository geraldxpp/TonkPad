"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cn } from "@/shared/lib/cn";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** After the label: a count, say. */
  trailing?: ReactNode;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  label: string;
  /** id of the element the tabs control (role="tabpanel"). */
  panelId: string;
  idPrefix: string;
  /** Placement classes for the tablist (e.g. a swipeable row on phones). */
  className?: string;
  /**
   * "md" and "panel" are pill groups (panel: raised, with 30 px tabs);
   * "underline" is a bare row of 56 px tabs with a cyan rule under the
   * selected one, for tabs that sit along a card's edge; "flush" has no side
   * padding, so the rule is exactly as wide as its label, and the selected
   * label stays plain text (68 px tall, or --tab-h / --tab-h-phone).
   */
  size?: "md" | "panel" | "underline" | "flush";
}

const BARE_ROW = "flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * ARIA tablist with a roving tab stop: Tab reaches the selected tab, the arrow
 * keys, Home and End move between tabs and select them.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, panelId, idPrefix, className, size = "md" }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange?.(tabs[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        size === "flush"
          ? cn(BARE_ROW, "gap-[25px] max-[699px]:gap-[23px]")
          : size === "underline"
            ? cn(BARE_ROW, "gap-0.5")
            : cn("flex flex-wrap gap-0.5 rounded-xl border border-line p-1", size === "panel" ? "bg-raised" : "bg-surface"),
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={`${idPrefix}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange?.(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "inline-flex flex-none items-center whitespace-nowrap",
              size === "flush"
                ? cn(
                    "h-[var(--tab-h,68px)] gap-[7px] border-b-2 text-[14px] font-semibold focus-visible:[outline-offset:-4px] max-[699px]:h-[var(--tab-h-phone,55px)] max-[699px]:text-[13px]",
                    active ? "border-accent text-text" : "border-transparent text-text-3 hover:text-text",
                  )
                : size === "underline"
                  ? cn(
                      "h-14 gap-1.5 border-b-2 px-2.5 text-[13px] font-medium focus-visible:[outline-offset:-4px]",
                      active ? "border-accent text-accent-text" : "border-transparent text-text-2 hover:text-text",
                    )
                  : cn(
                      "gap-1.5 text-[13px] font-medium",
                      size === "panel" ? "h-[30px] rounded-lg px-3" : "h-8 rounded-[9px] px-3.5",
                      active ? "bg-input text-text" : "bg-transparent text-text-2",
                    ),
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.trailing}
          </button>
        );
      })}
    </div>
  );
}
