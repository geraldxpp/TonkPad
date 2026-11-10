"use client";

import { useCallback, useRef, useState } from "react";
import type { ChainId } from "@/shared/types/chain";
import type { RecentSwap, SwapQuote, SwapTxState } from "@/shared/types/swap";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";
import { fetchBuild, fetchTxState, type QuoteRequest, SwapApiError, sendSolana } from "./api";
import { recordSwap } from "./recent";

/**
 * Where a swap is: building the transaction, an ERC-20 approval (asked in
 * the wallet, then confirmed on-chain), the swap signature, sending
 * (Solana), confirming, then done or failed.
 */
export type RunStep = "idle" | "preparing" | "approve" | "approving" | "sign" | "sending" | "confirming" | "done" | "failed";

export interface RunState {
  step: RunStep;
  /** Why it failed: "rejected", "closed", "expired", "failed", "timeout", "no-route"… */
  error: string | null;
  tx: string | null;
  /** The firm quote the transaction was built from. */
  quote: SwapQuote | null;
}

/** What Recent shows for the swap. */
export interface RunLabels {
  from: { symbol: string; amount: string };
  to: { symbol: string; amount: string };
}

const IDLE: RunState = { step: "idle", error: null, tx: null, quote: null };
const POLL_MS = 2_000;
const CONFIRM_TIMEOUT_MS = 90_000;

/** ERC-20 approve(spender, amount) calldata. */
export function approveData(spender: string, amount: string): string {
  const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return `0x095ea7b3${word(spender)}${word(BigInt(amount).toString(16))}`;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until the transaction lands or fails; a slow network ends in "timeout" (the swap may still land). */
async function settle(chain: ChainId, tx: string): Promise<Exclude<SwapTxState, "pending">> {
  const started = Date.now();
  while (Date.now() - started < CONFIRM_TIMEOUT_MS) {
    await pause(POLL_MS);
    const state = await fetchTxState(chain, tx).catch(() => "pending" as const);
    if (state !== "pending") return state;
  }
  throw new SwapApiError("timeout");
}

const codeOf = (error: unknown) =>
  error instanceof WalletActionError || error instanceof SwapApiError ? error.code : "failed";

/**
 * Runs one swap end to end with the connected wallet, recording it in Recent
 * as soon as it has a transaction id. Only one runs at a time.
 */
export function useSwapRun() {
  const [state, setState] = useState<RunState>(IDLE);
  const busy = useRef(false);

  const run = useCallback(async (request: QuoteRequest & { taker: string }, labels: RunLabels) => {
    if (busy.current) return;
    busy.current = true;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let tx: string | null = null;
    const record = (txState: SwapTxState) => {
      if (tx) recordSwap({ id, chain: request.chain, ...labels, tx, state: txState, at: Date.now() } satisfies RecentSwap);
    };
    const step = (next: Partial<RunState>) => setState((was) => ({ ...was, ...next }));
    try {
      setState({ ...IDLE, step: "preparing" });
      let build = await fetchBuild(request);
      if (build.evm?.approval) {
        const { token, spender, amount } = build.evm.approval;
        step({ step: "approve", quote: build.quote });
        const approval = await wallet.sendEvmTransaction({ to: token, data: approveData(spender, amount), value: "0", gas: null });
        step({ step: "approving" });
        if ((await settle("rh", approval)) !== "confirmed") throw new SwapApiError("failed");
        step({ step: "preparing" });
        build = await fetchBuild(request);
      }
      step({ step: "sign", quote: build.quote });
      if (build.solana) {
        const signed = await wallet.signSolanaTransaction(build.solana.transaction);
        step({ step: "sending" });
        tx = (await sendSolana(signed)).signature;
      } else if (build.evm) {
        tx = await wallet.sendEvmTransaction(build.evm.transaction);
      } else {
        throw new SwapApiError("unavailable");
      }
      record("pending");
      step({ step: "confirming", tx });
      const final = await settle(request.chain, tx);
      record(final);
      step({ step: final === "confirmed" ? "done" : "failed", error: final === "confirmed" ? null : "failed" });
    } catch (error) {
      const code = codeOf(error);
      record(code === "timeout" ? "pending" : "failed");
      step({ step: "failed", error: code, tx });
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (!busy.current) setState(IDLE);
  }, []);

  return { state, run, reset };
}
