"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  isTheme,
  readTheme,
  saveTheme,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  type Theme,
} from "../lib/theme";

function subscribe(onChange: () => void) {
  // A change made in another tab arrives as a storage event; mirror it here.
  function onStorage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY) applyTheme(isTheme(event.newValue) ? event.newValue : DEFAULT_THEME);
  }
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The page theme and setters. The server always renders dark; after
 * hydration this reads the real theme from <html data-theme>. Icons that
 * depend on it use the `light:` CSS variant instead, so they never flicker.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const setTheme = useCallback((next: Theme) => saveTheme(next), []);
  const toggleTheme = useCallback(() => saveTheme(readTheme() === "light" ? "dark" : "light"), []);
  return { theme, setTheme, toggleTheme };
}
