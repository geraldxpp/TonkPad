"use client";

import { Search } from "lucide-react";
import type { Ref } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { IconButton } from "@/shared/ui/IconButton";
import { SEARCH_BOX_ID } from "./SearchBox";

interface SearchToggleProps {
  open: boolean;
  /** Shows a dot while a query is filtering the list but the field is folded away. */
  active?: boolean;
  onToggle?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

/** Phones only: the magnifier that opens the search row under the top bar. */
export function SearchToggle({ open, active = false, onToggle, buttonRef }: SearchToggleProps) {
  const { t } = useI18n();
  return (
    <IconButton
      ref={buttonRef}
      label={t.header.searchToggle}
      size={40}
      aria-expanded={open}
      aria-controls={SEARCH_BOX_ID}
      onClick={onToggle}
      className="md:hidden"
    >
      <Search size={18} strokeWidth={1.8} />
      {active && !open ? (
        <span className="absolute top-[9px] right-[9px] size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--surface)]" />
      ) : null}
    </IconButton>
  );
}
