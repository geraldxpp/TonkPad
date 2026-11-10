"use client";

import { useCallback, useState } from "react";
import { buildTrade, TonkApiError } from "@/shared/tonk/api";
import type { MissionJson, TradeRequest } from "@/shared/tonk/mission";
import { settled } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

/** Where a trade stands before it has a hash: checking with the launchpad, the approval a sell needs, then the wallet. */
export type CurveStep = "idle" | "preparing" | "approve" | "approving" | "sign" | "failed";

export interface CurveRunState {
  step: CurveStep;
  /** Why it stopped: "rejected", "network", "funds", "tokens", "paused", "graduated", "early", "refused", "reverted", "replaced", "busy", "unavailable". */
  error: string | null;
  /** The approval's hash, once the wallet has sent it. */
  approval: string | null;
  /** The price moved past the trader's minimum: nothing was sent, and the figures were updated. */
  moved: boolean;
}

const IDLE: CurveRunState = { step: "idle", error: null, approval: null, moved: false };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");

interface CurveRunOptions {
  /** The server read newer state while building: the page takes it at once. */
  onMission: (mission: MissionJson) => void;
  /** The wallet sent the trade; from here its hash is watched. */
  onSent: (hash: string) => void;
}

/**
 * Runs one curve trade up to its hash. The server reads the mission at one
 * block, simulates the exact call there and builds the transaction. A sell
 * the launchpad may not yet take first has the wallet approve exactly that
 * amount, and waits for the approval's receipt. Only then is the trade
 * signed. Nothing is ever sent from here but through the wallet.
 */
export function useCurveRun({ onMission, onSent }: CurveRunOptions) {
  const [state, setState] = useState<CurveRunState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const start = useCallback(
    async (request: TradeRequest) => {
      setState({ ...IDLE, step: "preparing" });
      let approval: string | null = null;
      try {
        // At most one approval, then the trade.
        for (let round = 0; round < 2; round += 1) {
          const build = await buildTrade(request);
          onMission(build.mission);
          if (build.step === "moved") return setState({ ...IDLE, moved: true });
          if (build.step === "approve") {
            if (round > 0) throw new TonkApiError("unavailable");
            setState({ ...IDLE, step: "approve" });
            approval = await wallet.sendEvmTransaction(build.tx);
            setState({ ...IDLE, step: "approving", approval });
            const result = await settled(approval);
            if (result.state !== "confirmed") throw new TonkApiError(result.state === "failed" ? "reverted" : result.state === "replaced" ? "replaced" : "unavailable");
            setState({ ...IDLE, step: "preparing", approval });
            continue;
          }
          setState({ ...IDLE, step: "sign", approval });
          const hash = await wallet.sendEvmTransaction(build.tx);
          setState(IDLE);
          return onSent(hash);
        }
        throw new TonkApiError("unavailable");
      } catch (error) {
        setState({ step: "failed", error: codeOf(error), approval, moved: false });
      }
    },
    [onMission, onSent],
  );
  return { state, start, reset };
}
