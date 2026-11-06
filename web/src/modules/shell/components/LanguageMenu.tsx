"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { fmt, localeName } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { LanguageLinks } from "./LanguageLinks";

/** Desktop menu width (md:w-[320px] below must match). */
const PANEL_WIDTH = 320;
/** Keeps the desktop menu clear of the 76 px rail. */
const MIN_LEFT = 88;

/**
 * The language button in the top bar (globe and code on desktop; a 32 px
 * globe button on phones) and the menu of languages it opens. On desktop the menu lines up with the button's right
 * edge, or its left edge when the header has wrapped the button towards the
 * rail. On phones the root isn't positioned, so the menu spans the sticky top
 * bar just below it. Escape, a click outside or tabbing away closes it.
 */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="true"]')?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle() {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      setAlignLeft(rect ? rect.right - PANEL_WIDTH < MIN_LEFT : false);
    }
    setOpen(!open);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={rootRef}
      className={cn("md:relative", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={fmt(t.prefs.languageMenu, { language: localeName(lang) })}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className="inline-flex size-8 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[13px] font-semibold text-text-2 md:h-10 md:w-auto md:border-line-strong md:pr-2 md:pl-2.5 md:text-text"
      >
        <Globe strokeWidth={1.8} aria-hidden="true" className="size-4 md:text-text-2" />
        <span className="uppercase max-md:hidden">{lang}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="text-text-2 max-md:hidden" />
      </button>
      {open ? (
        <div
          id={panelId}
          className={cn(
            "absolute inset-x-3 top-full z-20 mt-1.5 rounded-[14px] border border-line-strong bg-raised p-1.5 shadow-menu",
            "md:top-[46px] md:mt-0 md:w-[320px]",
            alignLeft ? "md:right-auto md:left-0" : "md:right-0 md:left-auto",
          )}
        >
          <LanguageLinks onStay={close} />
        </div>
      ) : null}
    </div>
  );
}
