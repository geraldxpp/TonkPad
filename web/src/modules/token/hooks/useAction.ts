"use client";

import { useCallback, useState } from "react";
import { buildAction, TonkApiError } from "@/shared/tonk/api";
import type { ActionRequest, TxEventJson } from "@/shared/tonk/mission";
import { settled } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

export type ActionStep = "idle" | "preparing" | "sign" | "confirming" | "done" | "failed";

export interface ActionState {
  step: ActionStep;
  /** Which action is running or last ran. */
  kind: ActionRequest["kind"] | null;
  error: string | null;
  hash: string | null;
  /** What the confirmed transaction did. */
  events: TxEventJson[];
}

/** With the server, the wallet or the chain: nothing else should start meanwhile. */
export const isWorking = (state: ActionState) => state.step === "preparing" || state.step === "sign" || state.step === "confirming";

const IDLE: ActionState = { step: "idle", kind: null, error: null, hash: null, events: [] };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");

/**
 * Runs a claim, a lock extension, an edit, a reward claim or a withdrawal:
 * the server checks and simulates it, the wallet sends it, and it counts
 * only once its receipt is confirmed. `onDone` runs then, to refresh the page.
 */
export function useAction(onDone: () => void) {
  const [state, setState] = useState<ActionState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const start = useCallback(
    async (request: ActionRequest) => {
      const kind = request.kind;
      setState({ ...IDLE, step: "preparing", kind });
      let hash: string | null = null;
      try {
        const build = await buildAction(request);
        setState({ ...IDLE, step: "sign", kind });
        hash = await wallet.sendEvmTransaction(build.tx);
        setState({ ...IDLE, step: "confirming", kind, hash });
        const result = await settled(hash);
        if (result.state !== "confirmed") throw new TonkApiError(result.state === "failed" ? "reverted" : result.state === "replaced" ? "replaced" : "unavailable");
        setState({ step: "done", kind, error: null, hash, events: result.events });
        onDone();
      } catch (error) {
        setState({ step: "failed", kind, error: codeOf(error), hash, events: [] });
      }
    },
    [onDone],
  );
  return { state, start, reset };
}
