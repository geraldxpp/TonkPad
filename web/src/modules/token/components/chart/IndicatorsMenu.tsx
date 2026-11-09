"use client";

import { Activity } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";

export interface Indicators {
  volume: boolean;
  marks: boolean;
}

interface IndicatorsMenuProps {
  value: Indicators;
  onChange: (next: Indicators) => void;
}

/** "Indicators (2)": the chart's two overlays, volume and the whale and smart-wallet marks, each switchable. */
export function IndicatorsMenu({ value, onChange }: IndicatorsMenuProps) {
  const { t } = useI18n();
  const c = t.token.chart;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const items = [
    { key: "volume", label: c.showVolume },
    { key: "marks", label: c.showMarks },
  ] as const;
  const count = items.filter((item) => value[item.key]).length;
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
      onBlur={(event) => {
        if (open && !root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-raised pr-2.5 pl-3 text-[12px] font-semibold text-text"
      >
        <Activity size={15} strokeWidth={1.8} className="text-text-2" aria-hidden="true" />
        {c.indicators}
        <span className="rounded-[5px] bg-accent/14 px-[5px] font-mono text-[12px] font-semibold text-accent-text">{count}</span>
      </button>
      {open ? (
        <div id={id} role="group" aria-label={c.indicators} className="absolute top-full right-0 z-30 mt-2 flex w-60 flex-col gap-0.5 rounded-xl border border-line bg-raised p-1.5 shadow-menu">
          {items.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-[13px] hover:bg-input">
              {item.label}
              <input
                type="checkbox"
                checked={value[item.key]}
                onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })}
                className="size-4 flex-none accent-[var(--cta)]"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
