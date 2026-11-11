"use client";

import { useEffect, useState } from "react";
import { fetchLaunchStatus } from "./api";
import type { TxEventJson } from "./mission";
import type { LaunchedMission, LaunchStatus, LaunchTxState, TxSender } from "./types";

const POLL_MS = 2_000;
/** After the first half minute a transaction is checked less often. */
const SLOW_AFTER_MS = 30_000;
const SLOW_POLL_MS = 5_000;
/** Unsettled this long, the screen says so; it never decides the outcome itself. */
export const STALL_MS = 90_000;

/** Only a receipt settles a transaction: its own, or that of the transaction the wallet sent in its place. */
export const isSettled = (state: LaunchTxState | "checking") => state === "confirmed" || state === "failed" || state === "replaced";

export interface TxView {
  /** "checking" before the first answer; "confirmed" only with a successful receipt. */
  state: LaunchTxState | "checking";
  /** The mission it launched, when it was a launch. */
  mission: LaunchedMission | null;
  /** What it did, once confirmed: a trade, a claim, an extension… */
  events: TxEventJson[];
  /** The last check couldn't reach the chain; it keeps trying. */
  unreachable: boolean;
  /** Still unsettled after a long while: said on screen, and it keeps checking. Never a failure. */
  stalled: boolean;
  /** The transaction the wallet sent in its place, found at the same nonce; the result shown is that one's. */
  replacedBy: string | null;
}

const START: TxView = { state: "checking", mission: null, events: [], unreachable: false, stalled: false, replacedBy: null };
const pause = (elapsed: number) => (elapsed < SLOW_AFTER_MS ? POLL_MS : SLOW_POLL_MS);

/**
 * Watches a transaction by its hash until a receipt settles it. An unknown
 * hash, a slow chain or a failed check never ends the watch: those stay
 * uncertain, and `stalled` says so after a while. It only reads, so
 * reloading the page (or opening the link elsewhere) resumes the watch and
 * never sends anything.
 */
export function useTxStatus(hash: string | null): TxView {
  const [view, setView] = useState<{ hash: string | null } & TxView>({ hash, ...START });

  useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer = 0;
    let sender: TxSender | null = null;
    const started = Date.now();
    const check = async () => {
      const status: LaunchStatus | null = await fetchLaunchStatus(hash, sender).catch(() => null);
      if (stopped) return;
      const elapsed = Date.now() - started;
      if (status) {
        sender = status.sender ?? sender;
        const done = isSettled(status.state);
        setView({ hash, state: status.state, mission: status.mission, events: status.events, unreachable: false, stalled: !done && elapsed > STALL_MS, replacedBy: status.replacedBy ?? null });
        if (done) return;
      } else {
        setView((prev) => ({ ...(prev.hash === hash ? prev : { hash, ...START }), unreachable: true, stalled: elapsed > STALL_MS }));
      }
      timer = window.setTimeout(check, pause(elapsed));
    };
    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [hash]);

  return view.hash === hash ? view : START;
}

/** A transaction a longer run waited for, once a receipt settled it. */
export interface SettledTx {
  state: LaunchTxState;
  events: TxEventJson[];
  block: number | null;
  replacedBy: string | null;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("stopped watching", "AbortError"));
    }, { once: true });
  });

/**
 * Waits for a transaction inside a longer run (an approval before a sale, a
 * claim): until a receipt settles it, however long that takes. It never
 * gives up and reports a failure; `onStall` fires once if it takes long,
 * and `signal` stops the watch (the page closed, or the person stopped it).
 */
export async function settled(hash: string, { signal, onStall }: { signal?: AbortSignal; onStall?: () => void } = {}): Promise<SettledTx> {
  const started = Date.now();
  let sender: TxSender | null = null;
  let stalled = false;
  for (;;) {
    if (signal?.aborted) throw new DOMException("stopped watching", "AbortError");
    const status: LaunchStatus | null = await fetchLaunchStatus(hash, sender).catch(() => null);
    if (signal?.aborted) throw new DOMException("stopped watching", "AbortError");
    if (status) {
      sender = status.sender ?? sender;
      if (isSettled(status.state)) return { state: status.state, events: status.events, block: status.block ?? null, replacedBy: status.replacedBy ?? null };
    }
    const elapsed = Date.now() - started;
    if (!stalled && elapsed > STALL_MS) {
      stalled = true;
      onStall?.();
    }
    await wait(pause(elapsed), signal);
  }
}
