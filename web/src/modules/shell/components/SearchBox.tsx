"use client";

import { Search } from "lucide-react";
import type { ChangeEventHandler, Ref } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";

interface SearchBoxProps {
  inputRef?: Ref<HTMLInputElement>;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Phones only: whether the field row is expanded under the top bar. */
  open?: boolean;
}

export const SEARCH_INPUT_ID = "tk-search";
export const SEARCH_BOX_ID = "tk-search-box";

/** The search field's look. SearchField adds the URL, "/" and phone toggle behaviour. */
export function SearchBox({ inputRef, defaultValue, onChange, open = false }: SearchBoxProps) {
  const { t } = useI18n();
  return (
    <label
      id={SEARCH_BOX_ID}
      htmlFor={SEARCH_INPUT_ID}
      className={cn(
        "flex h-10 min-w-0 max-w-[560px] flex-[1_1_360px] items-center gap-2.5 rounded-lg border border-line bg-raised/55 pr-2.5 pl-3.5 text-text-3 md:mr-auto has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-cta has-[input:focus-visible]:outline-solid",
        "max-md:order-last max-md:max-w-none max-md:basis-full",
        open ? "max-md:flex" : "max-md:hidden",
      )}
    >
      <Search size={16} strokeWidth={2} />
      <span className="sr-only">{t.header.search}</span>
      <input
        ref={inputRef}
        id={SEARCH_INPUT_ID}
        type="search"
        placeholder={t.header.searchPlaceholder}
        defaultValue={defaultValue}
        onChange={onChange}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-auto border-0 bg-transparent px-0.5 py-px text-[13px] text-text outline-none focus-visible:outline-none max-md:text-[16px]"
      />
      <kbd
        aria-hidden="true"
        className="rounded border border-line-strong px-[7px] py-px font-mono text-[11px] font-normal text-text-3 max-md:hidden"
      >
        /
      </kbd>
    </label>
  );
}
