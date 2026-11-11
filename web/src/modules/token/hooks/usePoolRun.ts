"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPoolTrade, TonkApiError } from "@/shared/tonk/api";
import type { PoolQuoteJson, PoolTradeRequest } from "@/shared/tonk/pool";
import { sameCall } from "@/shared/tonk/types";
import { settled } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

/** Where a pool trade stands before it has a hash: checking at one block, a sell's two exact approvals, then the wallet. */
export type PoolStep = "idle" | "preparing" | "approve" | "approving" | "allow" | "allowing" | "sign" | "failed";

export interface PoolRunState {
  step: PoolStep;
  /** Why it stopped: "rejected", "network", "funds", "tokens", "pending", "refused", "reverted", "replaced", "approvedNotSent", "busy", "unavailable". */
  error: string | null;
  /** The latest approval's hash, once the wallet has sent it. */
  approval: string | null;
  /** The pool moved past the trader's minimum: nothing was sent, and this is the fresh quote. */
  moved: PoolQuoteJson | null;
  /** An approval has been confirming for a long while: said on screen, and the watch goes on. */
  stalled: boolean;
}

const IDLE: PoolRunState = { step: "idle", error: null, approval: null, moved: null, stalled: false };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Runs one trade on a graduated token's pool up to its hash. The server
 * checks the pool at one block and builds the swap. A sell first has the
 * wallet approve Permit2 for exactly the amount, then allow Uniswap's router
 * exactly that for thirty minutes, each waited out to its receipt however
 * long it takes; the next step is built no earlier than that receipt's block.
 * Something the wallet sent in an approval's place counts only if it made the
 * very same call; anything else stops the run, which says so. Nothing is ever
 * sent but through the wallet.
 */
export function usePoolRun(onSent: (hash: string) => void) {
  const [state, setState] = useState<PoolRunState>(IDLE);
  const watch = useRef<AbortController | null>(null);
  useEffect(() => () => watch.current?.abort(), []);

  /** Back to idle. An approval still on its way is left to the wallet, never called failed. */
  const reset = useCallback(() => {
    watch.current?.abort();
    watch.current = null;
    setState(IDLE);
  }, []);

  const start = useCallback(
    async (request: PoolTradeRequest) => {
      watch.current?.abort();
      const control = new AbortController();
      watch.current = control;
      setState({ ...IDLE, step: "preparing" });
      let approval: string | null = null;
      const done = new Set<"approve" | "allow">();
      try {
        // At most the two approvals, then the swap.
        for (let round = 0; round < 3; round += 1) {
          const build = await buildPoolTrade(approval ? { ...request, approval } : request);
          if (control.signal.aborted) return;
          if (build.step === "moved") return setState({ ...IDLE, moved: build.quote, approval });
          if (build.step === "approve" || build.step === "allow") {
            // Built at or after that same step's confirmed receipt, the pool still can't take the tokens.
            if (done.has(build.step)) throw new TonkApiError("approvedNotSent");
            const step = build.step;
            setState({ ...IDLE, step, approval });
            const sent = await wallet.sendEvmTransaction(build.tx);
            approval = sent;
            setState({ ...IDLE, step: step === "approve" ? "approving" : "allowing", approval: sent });
            const result = await settled(sent, { signal: control.signal, onStall: () => setState((prev) => (prev.approval === sent ? { ...prev, stalled: true } : prev)) });
            if (result.state === "failed") throw new TonkApiError("reverted");
            // A replacement counts only as a sped-up copy of the same call: neither approval leaves an event this page reads.
            const ours = !result.replacedBy || (result.replacedCall !== null && sameCall(result.replacedCall, build.tx));
            if (result.state !== "confirmed" || !ours) throw new TonkApiError("replaced");
            approval = result.replacedBy ?? sent;
            done.add(step);
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
        // An approval that went through stays true, whatever then stopped the sale; declining in the wallet says so itself.
        const code = done.size > 0 && !(error instanceof WalletActionError) && !(error instanceof TonkApiError && error.code === "replaced") ? "approvedNotSent" : codeOf(error);
        setState({ ...IDLE, step: "failed", error: code, approval });
      }
    },
    [onSent],
  );
  return { state, start, reset };
}
