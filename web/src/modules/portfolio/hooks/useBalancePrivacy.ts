"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Remembered on this device. New keys keep the old name's prefix. */
export const PRIVACY_KEY = "tonkpad-portfolio-hidden";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(PRIVACY_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether balances are hidden on this device. The server render always shows them hidden-free, then this takes over. */
export function useBalancePrivacy(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(PRIVACY_KEY, String(!read()));
    } catch {
      // Private browsing may block storage: nothing to remember.
    }
    for (const listener of listeners) listener();
  }, []);
  return [hidden, toggle];
}
