import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { ChainMark } from "@/shared/ui/ChainMark";
import type { ChainFilterValue } from "../data/shell.mock";

export const CHAIN_OPTIONS: ReadonlyArray<{ id: ChainFilterValue; label: string }> = [
  { id: "all", label: "All Chains" },
  { id: "sol", label: "Solana" },
  { id: "rh", label: "Robinhood Chain" },
];

export function chainLabel(value: ChainFilterValue): string {
  return CHAIN_OPTIONS.find((option) => option.id === value)?.label ?? "All Chains";
}

interface ChainTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: ChainFilterValue;
  buttonRef?: Ref<HTMLButtonElement>;
}

/** The chain pill: stacked S and R marks, the current label and a chevron. */
export function ChainTrigger({ value, buttonRef, ...rest }: ChainTriggerProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="listbox"
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface pr-2.5 pl-2 text-text"
      {...rest}
    >
      <span className="inline-flex" aria-hidden="true">
        {value !== "rh" ? <ChainMark chain="sol" size={20} letterSize={9} ring="#0D0F17" decorative /> : null}
        {value !== "sol" ? (
          <ChainMark
            chain="rh"
            size={20}
            letterSize={9}
            ring="#0D0F17"
            decorative
            className={value === "all" ? "-ml-1.5" : undefined}
          />
        ) : null}
      </span>
      <span className="text-[13px] font-semibold whitespace-nowrap">{chainLabel(value)}</span>
      <ChevronDown size={14} strokeWidth={2} className="text-text-2" />
    </button>
  );
}
