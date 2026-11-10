"use client";

import { useSyncExternalStore } from "react";

/** The slippage someone picked (bps), kept for their next visit and shared by Swap and the token pages. */
export const SLIPPAGE_KEY = "tonkfun-slippage";
export const SLIPPAGE_OPTIONS = [50, 100, 300] as const;
export const DEFAULT_SLIPPAGE = 100;

const listeners = new Set<() => void>();
let picked: number | null = null;

function read(): number {
  if (picked !== null) return picked;
  try {
    const saved = Number(localStorage.getItem(SLIPPAGE_KEY));
    picked = Number.isInteger(saved) && saved >= 10 && saved <= 1_000 ? saved : DEFAULT_SLIPPAGE;
  } catch {
    picked = DEFAULT_SLIPPAGE;
  }
  return picked;
}

function save(bps: number) {
  picked = bps;
  try {
    localStorage.setItem(SLIPPAGE_KEY, String(bps));
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The saved slippage (1% until someone picks; 1% in the server render), and a setter that saves it. */
export function useSlippage(): [number, (bps: number) => void] {
  return [useSyncExternalStore(subscribe, read, () => DEFAULT_SLIPPAGE), save];
}
