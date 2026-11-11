"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAction, TonkApiError } from "@/shared/tonk/api";
import type { ActionKind, ActionRequest, TxEventJson } from "@/shared/tonk/mission";
import { settled } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

export type ActionStep = "idle" | "preparing" | "sign" | "confirming" | "done" | "failed";

export interface ActionState {
  step: ActionStep;
  /** Which action is running or last ran. */
  kind: ActionRequest["kind"] | null;
  error: string | null;
  /** The transaction that settled it: the one sent, or the one the wallet sent in its place. */
  hash: string | null;
  /** What the confirmed transaction did. */
  events: TxEventJson[];
  /** Confirming for a long while: said on screen, and the watch goes on. */
  stalled: boolean;
}

/** With the server, the wallet or the chain: nothing else should start meanwhile. */
export const isWorking = (state: ActionState) => state.step === "preparing" || state.step === "sign" || state.step === "confirming";

const IDLE: ActionState = { step: "idle", kind: null, error: null, hash: null, events: [], stalled: false };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** The event each action leaves in its receipt. */
const EXPECTED: Record<ActionKind, TxEventJson["kind"]> = { claim: "claimed", extend: "extended", edit: "edited", rewards: "rewards", withdraw: "withdrawn" };

/**
 * Runs a claim, a lock extension, an edit, a reward claim or a withdrawal:
 * the server checks and simulates it, the wallet sends it, and it counts
 * only once a receipt confirms it. No timer or failed check turns into a
 * failure: it stays confirming until the chain answers, unless the person
 * stops watching (`reset`). A transaction the wallet sent in its place
 * counts only if it did the same. `onDone` runs once it is done, to refresh
 * the page.
 */
export function useAction(onDone: () => void) {
  const [state, setState] = useState<ActionState>(IDLE);
  const watch = useRef<AbortController | null>(null);
  useEffect(() => () => watch.current?.abort(), []);

  /** Back to idle. A transaction still on its way is left to the wallet, never called failed. */
  const reset = useCallback(() => {
    watch.current?.abort();
    watch.current = null;
    setState(IDLE);
  }, []);

  const start = useCallback(
    async (request: ActionRequest) => {
      watch.current?.abort();
      const control = new AbortController();
      watch.current = control;
      const kind = request.kind;
      setState({ ...IDLE, step: "preparing", kind });
      let hash: string | null = null;
      try {
        const build = await buildAction(request);
        if (control.signal.aborted) return;
        setState({ ...IDLE, step: "sign", kind });
        const sent = await wallet.sendEvmTransaction(build.tx);
        hash = sent;
        setState({ ...IDLE, step: "confirming", kind, hash: sent });
        const result = await settled(sent, { signal: control.signal, onStall: () => setState((prev) => (prev.hash === sent ? { ...prev, stalled: true } : prev)) });
        if (result.state === "failed") throw new TonkApiError("reverted");
        if (result.state !== "confirmed" || (result.replacedBy && !result.events.some((event) => event.kind === EXPECTED[kind]))) throw new TonkApiError("replaced");
        setState({ ...IDLE, step: "done", kind, hash: result.replacedBy ?? sent, events: result.events });
        onDone();
      } catch (error) {
        if (isAbort(error) || control.signal.aborted) return;
        setState({ ...IDLE, step: "failed", kind, error: codeOf(error), hash });
      }
    },
    [onDone],
  );
  return { state, start, reset };
}
