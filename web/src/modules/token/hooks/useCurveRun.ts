"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildTrade, TonkApiError } from "@/shared/tonk/api";
import type { MissionJson, TradeRequest } from "@/shared/tonk/mission";
import { settled } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

/** Where a trade stands before it has a hash: checking with the launchpad, the approval a sell needs, then the wallet. */
export type CurveStep = "idle" | "preparing" | "approve" | "approving" | "sign" | "failed";

export interface CurveRunState {
  step: CurveStep;
  /** Why it stopped: "rejected", "network", "funds", "tokens", "paused", "graduated", "early", "refused", "reverted", "replaced", "approvedNotSent", "busy", "unavailable". */
  error: string | null;
  /** The approval's hash, once the wallet has sent it (or the one it sent in its place). */
  approval: string | null;
  /** The price moved past the trader's minimum: nothing was sent, and the figures were updated. */
  moved: boolean;
  /** The approval has been confirming for a long while: said on screen, and the watch goes on. */
  stalled: boolean;
}

const IDLE: CurveRunState = { step: "idle", error: null, approval: null, moved: false, stalled: false };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

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
 * amount, and waits for the approval's receipt, however long it takes; the
 * sale is then built no earlier than that receipt's block. If anything stops
 * the sale after the approval went through, it says so. Nothing is ever
 * sent from here but through the wallet.
 */
export function useCurveRun({ onMission, onSent }: CurveRunOptions) {
  const [state, setState] = useState<CurveRunState>(IDLE);
  const watch = useRef<AbortController | null>(null);
  useEffect(() => () => watch.current?.abort(), []);

  /** Back to idle. An approval still on its way is left to the wallet, never called failed. */
  const reset = useCallback(() => {
    watch.current?.abort();
    watch.current = null;
    setState(IDLE);
  }, []);

  const start = useCallback(
    async (request: TradeRequest) => {
      watch.current?.abort();
      const control = new AbortController();
      watch.current = control;
      setState({ ...IDLE, step: "preparing" });
      let approval: string | null = null;
      let approved = false;
      try {
        // At most one approval, then the trade.
        for (let round = 0; round < 2; round += 1) {
          const build = await buildTrade(approved ? { ...request, approval } : request);
          if (control.signal.aborted) return;
          onMission(build.mission);
          if (build.step === "moved") return setState({ ...IDLE, moved: true, approval });
          if (build.step === "approve") {
            // Built at or after the confirmed approval's block, the launchpad still can't take the tokens.
            if (approved) throw new TonkApiError("approvedNotSent");
            setState({ ...IDLE, step: "approve" });
            const sent = await wallet.sendEvmTransaction(build.tx);
            approval = sent;
            setState({ ...IDLE, step: "approving", approval: sent });
            const result = await settled(sent, { signal: control.signal, onStall: () => setState((prev) => (prev.approval === sent ? { ...prev, stalled: true } : prev)) });
            if (result.state === "failed") throw new TonkApiError("reverted");
            // Something the wallet sent in its place counts only if it approved the same.
            const approvedHere = result.events.some((event) => event.kind === "approved" && same(event.token, request.token) && same(event.owner, request.trader) && BigInt(event.amount) >= BigInt(request.amount));
            if (result.state !== "confirmed" || (result.replacedBy && !approvedHere)) throw new TonkApiError("replaced");
            approval = result.replacedBy ?? sent;
            approved = true;
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
        if (isAbort(error) || control.signal.aborted) return;
        // An approval that went through stays true, whatever then stopped the sale; declining it in the wallet says so itself.
        const code = approved && !(error instanceof WalletActionError) ? "approvedNotSent" : codeOf(error);
        setState({ ...IDLE, step: "failed", error: code, approval });
      }
    },
    [onMission, onSent],
  );
  return { state, start, reset };
}
