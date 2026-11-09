"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cn } from "@/shared/lib/cn";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
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
  /** "panel" is the token screen's activity tabs: a raised group with 30 px tabs. */
  size?: "md" | "panel";
}

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
      className={cn("flex flex-wrap gap-0.5 rounded-xl border border-line p-1", size === "panel" ? "bg-raised" : "bg-surface", className)}
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
              "inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap",
              size === "panel" ? "h-[30px] rounded-lg px-3" : "h-8 rounded-[9px] px-3.5",
              active ? "bg-input text-text" : "bg-transparent text-text-2",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
