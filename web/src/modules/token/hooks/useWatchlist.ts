"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readWatchlist, subscribeWatchlist, writeWatchlist } from "@/shared/lib/watchlist";

/** Whether a token is on this browser's watchlist, and a toggle. Tabs stay in step through the storage event. */
export function useWatchlist(address: string) {
  const watched = useSyncExternalStore(subscribeWatchlist, () => readWatchlist().includes(address), () => false);
  const toggle = useCallback(() => {
    const list = readWatchlist();
    writeWatchlist(list.includes(address) ? list.filter((item) => item !== address) : [...list, address]);
  }, [address]);
  return { watched, toggle };
}
