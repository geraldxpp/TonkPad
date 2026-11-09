"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "tonkpad-watchlist";
const CHANGED = "tonkpad-watchlist-change";

function read(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Whether a token is on this browser's watchlist, and a toggle. Tabs stay in step through the storage event. */
export function useWatchlist(address: string) {
  const watched = useSyncExternalStore(subscribe, () => read().includes(address), () => false);
  const toggle = useCallback(() => {
    const list = read();
    const next = list.includes(address) ? list.filter((item) => item !== address) : [...list, address];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return; // Storage blocked (private mode): nothing to remember it in.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, [address]);
  return { watched, toggle };
}
