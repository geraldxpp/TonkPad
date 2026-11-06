"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { isChainId } from "@/shared/config/chains";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { formatInteger } from "@/shared/lib/format";
import { ChainMark } from "@/shared/ui/ChainMark";
import type { ChainFilterValue } from "../data/shell.mock";
import { useUrlParams } from "../hooks/useUrlParams";
import { CHAIN_OPTIONS, ChainTrigger, chainLabel } from "./ChainTrigger";

interface ChainFilterProps {
  counts: Record<ChainFilterValue, number>;
  /** Placement classes for the wrapper (e.g. hide it in the phone top bar). */
  className?: string;
  /** Marks and chevron only, for the phone list toolbar. */
  compact?: boolean;
}

/**
 * Chain picker bound to `?chain=`. A listbox that opens from the pill, moves
 * with the arrow keys, Home and End, picks with Enter or Space and closes on
 * Escape, Tab or a click outside. Focus returns to the pill after a pick.
 */
export function ChainFilter({ counts, className, compact = false }: ChainFilterProps) {
  const { t } = useI18n();
  const { params, setParams } = useUrlParams();
  const raw = params.get("chain");
  const value: ChainFilterValue = isChainId(raw) ? raw : "all";
  const selected = Math.max(0, CHAIN_OPTIONS.indexOf(value));

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function pick(id: ChainFilterValue) {
    setParams({ chain: id === "all" ? null : id });
    close(true);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(selected);
    }
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = CHAIN_OPTIONS.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in keys) {
      event.preventDefault();
      setActive(keys[event.key]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <ChainTrigger
        value={value}
        compact={compact}
        buttonRef={triggerRef}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openAt(selected))}
        onKeyDown={onTriggerKeyDown}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t.chain.menu}
          className="absolute top-[46px] right-0 z-20 flex w-[240px] flex-col gap-0.5 rounded-[14px] border border-line-strong bg-raised p-1.5 shadow-menu"
        >
          {CHAIN_OPTIONS.map((option, index) => (
            <button
              key={option}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={option === value}
              tabIndex={index === active ? 0 : -1}
              onClick={() => pick(option)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-text",
                option === value ? "bg-accent/14" : "bg-transparent",
              )}
            >
              <span className="inline-flex w-[34px]" aria-hidden="true">
                {option !== "rh" ? <ChainMark chain="sol" size={18} letterSize={9} decorative /> : null}
                {option !== "sol" ? (
                  <ChainMark
                    chain="rh"
                    size={18}
                    letterSize={9}
                    ring="var(--raised)"
                    decorative
                    className={option === "all" ? "-ml-1.5" : undefined}
                  />
                ) : null}
              </span>
              <span className="flex-auto text-[13px] font-medium">{chainLabel(option, t)}</span>
              <span className="font-mono text-[12px] text-text-3">{formatInteger(counts[option])}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
