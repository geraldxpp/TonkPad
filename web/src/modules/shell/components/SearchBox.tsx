import { Search } from "lucide-react";
import type { ChangeEventHandler, Ref } from "react";

interface SearchBoxProps {
  inputRef?: Ref<HTMLInputElement>;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

export const SEARCH_INPUT_ID = "tk-search";

/** The search field's look. SearchField adds the URL and "/" behaviour. */
export function SearchBox({ inputRef, defaultValue, onChange }: SearchBoxProps) {
  return (
    <label
      htmlFor={SEARCH_INPUT_ID}
      className="flex h-10 max-w-[340px] flex-[1_1_240px] items-center gap-2 rounded-xl border border-line bg-surface pr-2 pl-3 text-text-3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-cta has-[input:focus-visible]:outline-solid max-md:max-w-none"
    >
      <Search size={16} strokeWidth={2} />
      <span className="sr-only">Search tokens</span>
      <input
        ref={inputRef}
        id={SEARCH_INPUT_ID}
        type="search"
        placeholder="Search token, ticker or CA"
        defaultValue={defaultValue}
        onChange={onChange}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-auto border-0 bg-transparent px-0.5 py-px text-[13px] text-text outline-none focus-visible:outline-none"
      />
      <kbd
        aria-hidden="true"
        className="rounded-md border border-line-strong bg-raised px-[7px] py-px font-mono text-[12px] font-normal text-text-2"
      >
        /
      </kbd>
    </label>
  );
}
