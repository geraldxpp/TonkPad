"use client";

import { useSyncExternalStore } from "react";
import type { RecentSwap } from "@/shared/types/swap";

/** Recent swaps live on this device only, newest first. */
export const RECENT_KEY = "tonkfun-recent-swaps";
const LIMIT = 20;
const EMPTY: readonly RecentSwap[] = [];

let cache: readonly RecentSwap[] | null = null;
const listeners = new Set<() => void>();

const isRecent = (value: unknown): value is RecentSwap => {
  if (typeof value !== "object" || value === null) return false;
  const swap = value as Record<string, unknown>;
  return typeof swap.id === "string" && typeof swap.tx === "string" && typeof swap.at === "number" && (swap.chain === "sol" || swap.chain === "rh");
};

function read(): readonly RecentSwap[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, LIMIT) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: readonly RecentSwap[]) {
  cache = next.slice(0, LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(cache));
  } catch {
    // Blocked storage: the list still holds for this visit.
  }
  for (const listener of listeners) listener();
}

/** Adds a swap, or updates the one with the same id (its state moving from pending to confirmed or failed). */
export function recordSwap(swap: RecentSwap) {
  const rest = read().filter((entry) => entry.id !== swap.id);
  write([swap, ...rest]);
}

export function clearRecent() {
  write([]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== RECENT_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

/** This device's recent swaps; empty during the server render. */
export function useRecentSwaps(): readonly RecentSwap[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
