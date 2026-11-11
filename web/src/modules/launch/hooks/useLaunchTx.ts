"use client";

import type { LaunchedMission, LaunchTxState } from "@/shared/tonk/types";
import { useTxStatus } from "@/shared/tonk/useTxStatus";

export interface LaunchTxView {
  /** "checking" before the first answer; "confirmed" only with a successful receipt. */
  state: LaunchTxState | "checking";
  mission: LaunchedMission | null;
  /** The last check couldn't reach the chain; it keeps trying. */
  unreachable: boolean;
  /** Still confirming after a long while: said on screen, and it keeps checking. */
  stalled: boolean;
  /** The transaction the wallet sent in its place; it launched only if its receipt shows a launch. */
  replacedBy: string | null;
}

/**
 * Watches a launch's transaction by its hash until a receipt settles it:
 * confirmed, failed, or replaced in the wallet by a transaction found at the
 * same nonce. It only reads, so reloading the page (or opening the link
 * elsewhere) resumes the watch and never sends anything.
 */
export function useLaunchTx(hash: string | null): LaunchTxView {
  const { state, mission, unreachable, stalled, replacedBy } = useTxStatus(hash);
  return { state, mission, unreachable, stalled, replacedBy };
}
