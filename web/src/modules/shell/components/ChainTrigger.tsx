"use client";

import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { CHAINS } from "@/shared/config/chains";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { ChainMark } from "@/shared/ui/ChainMark";
import type { ChainFilterValue } from "../data/shell.mock";

export const CHAIN_OPTIONS: readonly ChainFilterValue[] = ["all", "sol", "rh"];

/** "All Chains" in the page's language; chain names are never translated. */
export function chainLabel(value: ChainFilterValue, t: Dictionary): string {
  return value === "all" ? t.chain.all : CHAINS[value].name;
}

interface ChainTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: ChainFilterValue;
  buttonRef?: Ref<HTMLButtonElement>;
  /** Marks and chevron only; the label stays as the accessible name. */
  compact?: boolean;
}

/** The chain pill: stacked S and R marks, the current label and a chevron. */
export function ChainTrigger({ value, buttonRef, compact = false, ...rest }: ChainTriggerProps) {
  const { t } = useI18n();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="listbox"
      className={cn(
        "inline-flex h-10 items-center rounded-xl border border-line-strong bg-surface pl-2 text-text",
        compact ? "gap-1 pr-2" : "gap-2 pr-2.5",
      )}
      {...rest}
    >
      <span className="inline-flex" aria-hidden="true">
        {value !== "rh" ? <ChainMark chain="sol" size={20} letterSize={9} ring="var(--surface)" decorative /> : null}
        {value !== "sol" ? (
          <ChainMark
            chain="rh"
            size={20}
            letterSize={9}
            ring="var(--surface)"
            decorative
            className={value === "all" ? "-ml-1.5" : undefined}
          />
        ) : null}
      </span>
      <span className={cn("text-[13px] font-semibold whitespace-nowrap", compact && "sr-only")}>
        {chainLabel(value, t)}
      </span>
      <ChevronDown size={14} strokeWidth={2} className="text-text-2" />
    </button>
  );
}
