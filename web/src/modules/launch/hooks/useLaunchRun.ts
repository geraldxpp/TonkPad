"use client";

import { useCallback, useState } from "react";
import { buildLaunch, TonkApiError } from "@/shared/tonk/api";
import type { TonkMode } from "@/shared/tonk/networks";
import type { LaunchRequest, TonkSettingsJson } from "@/shared/tonk/types";
import { WalletActionError } from "@/shared/wallet/types";
import { wallet } from "@/shared/wallet/wallet";

/** Where a launch stands before it has a hash: checking with the launchpad, waiting on the wallet, or stopped. */
export type RunStep = "idle" | "preparing" | "sign" | "failed";

export interface RunState {
  step: RunStep;
  /** Why it stopped: "rejected", "network", "funds", "paused", "refused", "busy", "unavailable"… */
  error: string | null;
  /** The launchpad's settings differed from the ones on screen: nothing was sent, and the figures were updated. */
  changed: boolean;
}

const IDLE: RunState = { step: "idle", error: null, changed: false };
const codeOf = (error: unknown) => (error instanceof WalletActionError || error instanceof TonkApiError ? error.code : "unavailable");
const sameSettings = (a: TonkSettingsJson, b: { launchFee: bigint; virtualEth: bigint; virtualTokens: bigint }) =>
  BigInt(a.launchFee) === b.launchFee && BigInt(a.virtualEth) === b.virtualEth && BigInt(a.virtualTokens) === b.virtualTokens;

interface RunOptions {
  mode: TonkMode;
  /** The settings the figures on screen were worked out from. */
  shown: { launchFee: bigint; virtualEth: bigint; virtualTokens: bigint };
  /** The server read newer settings while building. */
  onSettings: (settings: TonkSettingsJson) => void;
  /** The wallet sent the launch; from here its hash is watched. */
  onSent: (hash: string) => void;
}

/**
 * Runs one launch up to its hash. The server reads the launchpad fresh,
 * simulates the exact call and builds the transaction; if its settings moved
 * since the review, nothing is sent and the review shows the new figures.
 * Only then is the wallet asked. The demo never asks a real wallet: outside
 * the e2e builds' stub it has no transaction to send.
 */
export function useLaunchRun({ mode, shown, onSettings, onSent }: RunOptions) {
  const [state, setState] = useState<RunState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const start = useCallback(
    async (request: LaunchRequest) => {
      setState({ step: "preparing", error: null, changed: false });
      try {
        const build = await buildLaunch(request);
        if (!sameSettings(build.settings, shown)) {
          onSettings(build.settings);
          setState({ step: "idle", error: null, changed: true });
          return;
        }
        if (mode !== "testnet" && process.env.NEXT_PUBLIC_WALLET_STUB !== "1") throw new TonkApiError("unavailable");
        setState({ step: "sign", error: null, changed: false });
        const hash = await wallet.sendEvmTransaction(build.tx);
        setState(IDLE);
        onSent(hash);
      } catch (error) {
        setState({ step: "failed", error: codeOf(error), changed: false });
      }
    },
    [mode, shown, onSettings, onSent],
  );
  return { state, start, reset };
}
