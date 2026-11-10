"use client";

import { useSyncExternalStore } from "react";

let open: boolean | null = null;
let asked = false;
const listeners = new Set<() => void>();

/** Asks the server once per page whether swaps are open. */
function ask() {
  if (asked) return;
  asked = true;
  fetch("/api/swap/open", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: unknown) => {
      if (typeof body === "object" && body !== null && "tradingOpen" in body && typeof body.tradingOpen === "boolean") {
        open = body.tradingOpen;
        for (const listener of listeners) listener();
      }
    })
    .catch(() => {
      asked = false;
    });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  ask();
  return () => {
    listeners.delete(listener);
  };
};

/** The go-live switch (null until the server answers), for when no quote has said yet. */
export function useTradingOpen(): boolean | null {
  return useSyncExternalStore(subscribe, () => open, () => null);
}
