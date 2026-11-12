"use client";

import { useSyncExternalStore } from "react";

/** Whether the Alerts panel is open: the top-bar bell and the rail's Alerts item open the same one. */
let open = false;
const listeners = new Set<() => void>();

export function setAlertsPanel(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useAlertsPanel = () => useSyncExternalStore(subscribe, () => open, () => false);
