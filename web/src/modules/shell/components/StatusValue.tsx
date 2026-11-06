"use client";

import { formatUsd } from "@/shared/lib/format";
import type { LiveStatus } from "@/shared/types/live";
import { useShellLive } from "../live/ShellLive";

const FORMAT: Record<keyof LiveStatus, (value: number) => string> = {
  solUsd: (v) => formatUsd(v),
  ethUsd: (v) => formatUsd(v, 0),
  rhGasGwei: (v) => `${v.toFixed(2)} gwei`,
};

/** One status-bar figure: the live value in live mode, else the mock one; "—" until it arrives. */
export function StatusValue({ field, fallback, className }: { field: keyof LiveStatus; fallback: number | null; className: string }) {
  const shell = useShellLive();
  const value = shell.live ? (shell.data?.status[field] ?? null) : fallback;
  return <span className={className}>{value === null ? "—" : FORMAT[field](value)}</span>;
}
