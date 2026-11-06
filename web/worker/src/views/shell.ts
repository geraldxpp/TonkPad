import type { LiveShell, LiveStatus } from "@/shared/types/live";
import type { TrackedToken } from "../model";
import { launchedToday } from "./list";

/** Ticker tape (the eight busiest tokens of the last hour), chain counts and status. */
export function shellView(tokens: readonly TrackedToken[], status: LiveStatus, now: number): LiveShell {
  const today = launchedToday(tokens, now);
  const tape = tokens
    .filter((t) => t.marketAt > 0 && t.marketCap >= 5_000 && t.windows.h1.volume > 0)
    .sort((a, b) => b.windows.h1.volume - a.windows.h1.volume)
    .slice(0, 8)
    .map((t) => ({
      address: t.address,
      ticker: t.symbol || "???",
      art: t.image ?? "",
      marketCap: t.marketCap,
      change24h: t.windows.h24.change,
    }));
  return {
    tape,
    chainCounts: {
      all: today.length,
      sol: today.filter((t) => t.chain === "sol").length,
      rh: today.filter((t) => t.chain === "rh").length,
    },
    status,
    updatedAt: now,
  };
}
