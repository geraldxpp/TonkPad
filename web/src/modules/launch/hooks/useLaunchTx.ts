"use client";

import type { LaunchedMission, LaunchTxState } from "@/shared/tonk/types";
import { useTxStatus } from "@/shared/tonk/useTxStatus";

export interface LaunchTxView {
  /** "checking" before the first answer; "confirmed" only with a successful receipt. */
  state: LaunchTxState | "checking";
  mission: LaunchedMission | null;
  /** The last check couldn't reach the chain; it keeps trying. */
  unreachable: boolean;
}

/**
 * Watches a launch's transaction by its hash until it settles: confirmed,
 * failed, or replaced in the wallet. It only reads, so reloading the page (or
 * opening the link elsewhere) resumes the watch and never sends anything.
 */
export function useLaunchTx(hash: string | null): LaunchTxView {
  const { state, mission, unreachable } = useTxStatus(hash);
  return { state, mission, unreachable };
}
