"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUrlParams } from "@/modules/shell/hooks/useUrlParams";
import { buildAction, TonkApiError } from "@/shared/tonk/api";
import type { ActionKind, ActionRequest, TxEventJson } from "@/shared/tonk/mission";
import { isTxHash, sameCall, type UnsignedTx } from "@/shared/tonk/types";
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
const KINDS: readonly ActionKind[] = ["claim", "extend", "edit", "rewards", "withdraw", "share"];
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/** What a receipt must show for an action: its kind, on its token (none for a withdrawal), for its wallet. */
export interface ActionTarget {
  kind: ActionKind;
  token?: string;
  owner: string;
}

/** Whether a receipt's events show this very action: its kind, on its token, for its wallet. */
export function didAction(target: ActionTarget, events: readonly TxEventJson[]): boolean {
  const token = target.token ?? "";
  return events.some((event) => {
    switch (target.kind) {
      case "claim":
        return event.kind === "claimed" && same(event.token, token);
      case "extend":
        return event.kind === "extended" && same(event.token, token);
      case "edit":
        return event.kind === "edited" && same(event.token, token);
      case "rewards":
        return event.kind === "rewards" && same(event.token, token) && same(event.holder, target.owner);
      case "withdraw":
        return event.kind === "withdrawn" && same(event.recipient, target.owner);
      case "share":
        return event.kind === "shared" && same(event.token, token);
    }
  });
}

/** `?action=<kind>:<hash>`: the action the wallet sent, kept in the URL like a trade's `?tx=`. */
export function actionFromUrl(raw: string | null): { kind: ActionKind; hash: string } | null {
  const [head = "", hash = ""] = (raw ?? "").split(":");
  const kind = KINDS.find((known) => known === head);
  return kind && isTxHash(hash) ? { kind, hash } : null;
}

/**
 * Runs a claim, a lock extension, an edit, a reward claim, a withdrawal or a
 * share of a graduated pool's fees: the server checks and simulates it, the
 * wallet sends it, and it counts only once a receipt confirms it. Its hash
 * goes into the URL (`?action=`), so a reload while it confirms watches the
 * same hash again, with every action held, and never offers it twice. No
 * timer or failed check turns into a failure: it stays confirming until the
 * chain answers, unless the person stops watching (`reset`). A transaction
 * the wallet sent in its place counts only if it made the very same call (a
 * speed-up), or, when that can't be compared, did this very action on this
 * token for this wallet. `onDone` runs once it is done, to refresh the page.
 */
export function useAction(onDone: () => void, here: { token: string; owner: string | null } = { token: "", owner: null }) {
  const { params, setParams } = useUrlParams();
  const fromUrl = actionFromUrl(params.get("action"));
  const [state, setState] = useState<ActionState>(IDLE);
  const watch = useRef<AbortController | null>(null);
  // The hash this page already follows, sent from here or picked up from the URL: never followed twice.
  const following = useRef<string | null>(null);
  // The latest wallet and refresh, read when a watch settles: a new callback each render never restarts the watch.
  const owner = useRef(here.owner);
  const done = useRef(onDone);
  useEffect(() => {
    owner.current = here.owner;
    done.current = onDone;
  }, [here.owner, onDone]);
  useEffect(() => () => watch.current?.abort(), []);

  /** Back to idle, and out of the URL. A transaction still on its way is left to the wallet, never called failed. */
  const reset = useCallback(() => {
    watch.current?.abort();
    watch.current = null;
    following.current = null;
    setState(IDLE);
    setParams({ action: null });
  }, [setParams]);

  /** Watches a sent action to its receipt. `call` is what was built here: unknown after a reload. */
  const follow = useCallback(
    async (target: ActionTarget, hash: string, call: UnsignedTx | null, signal: AbortSignal) => {
      const { kind } = target;
      following.current = hash;
      setState({ ...IDLE, step: "confirming", kind, hash });
      const result = await settled(hash, { signal, onStall: () => setState((prev) => (prev.hash === hash ? { ...prev, stalled: true } : prev)) });
      if (result.state === "failed") throw new TonkApiError("reverted");
      const ours = !result.replacedBy || (result.replacedCall && call ? sameCall(result.replacedCall, call) : didAction({ ...target, owner: target.owner || (owner.current ?? "") }, result.events));
      if (result.state !== "confirmed" || !ours) throw new TonkApiError("replaced");
      setState({ ...IDLE, step: "done", kind, hash: result.replacedBy ?? hash, events: result.events });
      done.current();
    },
    [],
  );

  /** A fresh watch in place of any earlier one. */
  const begin = useCallback(() => {
    watch.current?.abort();
    const control = new AbortController();
    watch.current = control;
    return control;
  }, []);
  const fail = useCallback((control: AbortController, kind: ActionKind, error: unknown, hash: string | null) => {
    if (isAbort(error) || control.signal.aborted) return;
    setState({ ...IDLE, step: "failed", kind, error: codeOf(error), hash });
  }, []);

  const start = useCallback(
    async (request: ActionRequest) => {
      const control = begin();
      const kind = request.kind;
      setState({ ...IDLE, step: "preparing", kind });
      let hash: string | null = null;
      try {
        const build = await buildAction(request);
        if (control.signal.aborted) return;
        setState({ ...IDLE, step: "sign", kind });
        hash = await wallet.sendEvmTransaction(build.tx);
        // Followed from here before the URL carries it, so the reload watch below never takes it up as well.
        following.current = hash;
        setParams({ action: `${kind}:${hash}` });
        await follow(request, hash, build.tx, control.signal);
      } catch (error) {
        fail(control, kind, error, hash);
      }
    },
    [begin, fail, follow, setParams],
  );

  // A reload, or coming back, while an action confirms: the same hash is watched again, and nothing is sent.
  const urlKind = fromUrl?.kind ?? null;
  const urlHash = fromUrl?.hash ?? null;
  const token = here.token;
  useEffect(() => {
    if (!urlKind || !urlHash || following.current === urlHash) return;
    const control = begin();
    follow({ kind: urlKind, token, owner: "" }, urlHash, null, control.signal).catch((error: unknown) => fail(control, urlKind, error, urlHash));
    // Undone with the effect (a remount, or new inputs), so the next run takes the same hash up again.
    return () => {
      control.abort();
      if (following.current === urlHash) following.current = null;
    };
  }, [urlKind, urlHash, token, begin, fail, follow]);

  return { state, start, reset };
}
