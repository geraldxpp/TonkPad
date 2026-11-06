"use client";

import { useEffect, useRef } from "react";
import { useSlashToFocus } from "../hooks/useSlashToFocus";
import { useUrlParams } from "../hooks/useUrlParams";
import { SearchBox } from "./SearchBox";

/**
 * Search box bound to `?q=`. Typing updates the URL on every keystroke; the
 * URL only writes back into the box while it is not focused (e.g. after
 * "Reset filters"), so fast typing is never overwritten.
 */
export function SearchField() {
  const { params, setParams } = useUrlParams();
  const q = params.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(inputRef);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== q) input.value = q;
  }, [q]);

  return (
    <SearchBox
      inputRef={inputRef}
      defaultValue={q}
      onChange={(event) => setParams({ q: event.target.value.trim() ? event.target.value : null })}
    />
  );
}
