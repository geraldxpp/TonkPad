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
}

/**
 * ARIA tablist with a roving tab stop: Tab reaches the selected tab, the arrow
 * keys, Home and End move between tabs and select them.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, panelId, idPrefix }: TabsProps<T>) {
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
      className="flex flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1"
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
              "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] font-medium whitespace-nowrap",
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
