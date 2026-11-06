"use client";

import { useEffect, useRef, useState } from "react";
import { useSlashToFocus } from "../hooks/useSlashToFocus";
import { useUrlParams } from "../hooks/useUrlParams";
import { SearchBox } from "./SearchBox";
import { SearchToggle } from "./SearchToggle";

/**
 * Search bound to `?q=`. Typing updates the URL on every keystroke; the URL
 * only writes back into the box while it is not focused (e.g. after "Reset
 * filters"), so fast typing is never overwritten. On phones the field folds
 * into a magnifier in the top bar and opens as its own row.
 */
export function SearchField() {
  const { params, setParams } = useUrlParams();
  const q = params.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusWhenOpen = useRef(false);
  const [open, setOpen] = useState(q !== "");

  function openAndFocus() {
    focusWhenOpen.current = true;
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      setOpen(true);
    }
  }

  useSlashToFocus(openAndFocus);

  useEffect(() => {
    if (!open || !focusWhenOpen.current) return;
    focusWhenOpen.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== q) input.value = q;
  }, [q]);

  return (
    <>
      <SearchToggle
        open={open}
        active={q !== ""}
        buttonRef={toggleRef}
        onToggle={() => (open ? setOpen(false) : openAndFocus())}
      />
      <SearchBox
        inputRef={inputRef}
        defaultValue={q}
        open={open}
        onChange={(event) => setParams({ q: event.target.value.trim() ? event.target.value : null })}
      />
    </>
  );
}
