"use client";

import { useSyncExternalStore } from "react";
import type { RecentTransfer, TransferState } from "./types";

/** Transfers live on this device only, newest first. */
export const RECENT_KEY = "tonkpad-bridge-recent";
const LIMIT = 30;
const EMPTY: readonly RecentTransfer[] = [];
const STATES: ReadonlySet<TransferState> = new Set(["source", "transit", "delivered", "refunded", "failed", "dropped"]);

let cache: readonly RecentTransfer[] | null = null;
const listeners = new Set<() => void>();

const isEnd = (value: unknown) => typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).network === "string" && typeof (value as Record<string, unknown>).symbol === "string";

export function isRecent(value: unknown): value is RecentTransfer {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.sourceTx === "string" && typeof item.at === "number" && typeof item.sender === "string" && typeof item.raw === "string" && isEnd(item.from) && isEnd(item.to) && typeof item.tracking === "object" && item.tracking !== null && STATES.has(item.state as TransferState);
}

/** Still on its way: worth following. */
export const inFlight = (transfer: Pick<RecentTransfer, "state">): boolean => transfer.state === "source" || transfer.state === "transit";

function read(): readonly RecentTransfer[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, LIMIT) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: readonly RecentTransfer[]) {
  cache = next.slice(0, LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(cache));
  } catch {
    // Blocked storage: the list still holds for this visit.
  }
  for (const listener of listeners) listener();
}

export function recordTransfer(transfer: RecentTransfer) {
  write([transfer, ...read().filter((entry) => entry.id !== transfer.id)]);
}

export function updateTransfer(id: string, patch: Partial<Pick<RecentTransfer, "state" | "destinationTx">>) {
  write(read().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
}

/** Clears the finished ones; anything still on its way stays, so it can be followed to the end. */
export function clearFinished() {
  write(read().filter(inFlight));
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

/** This device's transfers; empty during the server render. */
export function useRecentTransfers(): readonly RecentTransfer[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
