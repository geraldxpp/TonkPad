"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatFull } from "@/shared/swap/amounts";
import { approveData } from "@/shared/swap/useSwapRun";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";
import { BridgeApiError, fetchBuild, fetchTxState, type RoutesRequest, sendSolana } from "../lib/api";
import type { BridgeAsset, BridgeNetwork } from "../lib/networks";
import { recordTransfer } from "../lib/recent";
import type { BridgeBuild, BridgeRoute } from "../lib/types";

/** Where a transfer is before it has left: building, an approval (asked, then confirmed), the signature, sending. */
export type RunStep = "idle" | "preparing" | "approve" | "approving" | "sign" | "sending" | "failed";

export interface RunState {
  step: RunStep;
  /** Why it stopped: "rejected", "network", "price-moved", "expired", "closed"… */
  error: string | null;
}

export interface RunLabels {
  from: BridgeNetwork;
  to: BridgeNetwork;
  sentSymbol: string;
  sentText: string;
  received: BridgeAsset;
}

const IDLE: RunState = { step: "idle", error: null };
const POLL_MS = 2_000;
const CONFIRM_TIMEOUT_MS = 120_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for an approval to land; a slow network ends in "timeout". */
async function settle(network: string, tx: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < CONFIRM_TIMEOUT_MS) {
    await pause(POLL_MS);
    const state = await fetchTxState(network, tx).catch(() => "pending" as const);
    if (state === "confirmed") return;
    if (state === "failed") throw new BridgeApiError("failed");
  }
  throw new BridgeApiError("timeout");
}

const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof BridgeApiError ? error.code : "failed");

/**
 * Takes one transfer from the review to the point it has left the wallet:
 * builds it, approves exactly what's being sent, has the wallet sign, then
 * saves it to Recent, from where it's followed to the end. Only one runs at a
 * time, and once saved a reload can never send it again.
 */
export function useBridgeRun(onSent: (transferId: string) => void) {
  const [state, setState] = useState<RunState>(IDLE);
  const busy = useRef(false);
  const latestOnSent = useRef(onSent);
  useEffect(() => {
    latestOnSent.current = onSent;
  });

  const run = useCallback(async (request: RoutesRequest & { sender: string; recipient: string }, route: BridgeRoute, labels: RunLabels) => {
    if (busy.current) return;
    busy.current = true;
    const step = (next: Partial<RunState>) => setState((was) => ({ ...was, ...next }));
    const ask = { ...request, routeId: route.id, reviewedOut: route.outAmount };
    try {
      setState({ ...IDLE, step: "preparing" });
      let build: BridgeBuild = await fetchBuild(ask);
      for (const { token, spender, amount } of build.approvals) {
        step({ step: "approve" });
        const approval = await wallet.sendBridgeTransaction({ chainId: labels.from.chainId, to: token, data: approveData(spender, amount), value: "0", gas: null });
        step({ step: "approving" });
        await settle(labels.from.id, approval);
      }
      if (build.approvals.length > 0) {
        step({ step: "preparing" });
        build = await fetchBuild(ask);
      }
      step({ step: "sign" });
      let sourceTx: string;
      if (build.solana) {
        const signed = await wallet.signSolanaTransaction(build.solana.transaction);
        step({ step: "sending" });
        sourceTx = (await sendSolana(signed)).signature;
      } else if (build.evm) {
        sourceTx = await wallet.sendBridgeTransaction(build.evm);
      } else {
        throw new BridgeApiError("unavailable");
      }
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      recordTransfer({
        id,
        from: { network: labels.from.id, symbol: labels.sentSymbol, amount: labels.sentText },
        to: { network: labels.to.id, symbol: labels.received.symbol, amount: formatFull({ raw: build.route.outAmount, decimals: labels.received.decimals }) },
        routeName: build.route.name,
        sender: request.sender,
        recipient: request.recipient,
        raw: request.amount,
        tracking: build.tracking,
        sourceTx,
        destinationTx: null,
        etaSeconds: build.route.etaSeconds,
        state: "source",
        at: Date.now(),
      });
      setState(IDLE);
      latestOnSent.current(id);
    } catch (error) {
      step({ step: "failed", error: codeOf(error) });
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (!busy.current) setState(IDLE);
  }, []);

  return { state, run, reset };
}
