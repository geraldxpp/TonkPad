"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import type { TokenDetail } from "@/shared/types/token-detail";
import { isLiveTokenDetail, isTokenAddress, type LiveTokenResult } from "./lib/live-token";
import { TokenView } from "./TokenView";

const REFRESH_MS = 4_000;
interface TokenLiveProps { address: string; initial: LiveTokenResult }
interface LiveState { detail: TokenDetail | null; status: "ok" | "not-found" | "unavailable" }

function initialState(initial: LiveTokenResult, address: string): LiveState {
  if (initial.status !== "ok") return { detail: null, status: initial.status };
  return isLiveTokenDetail(initial.detail, address)
    ? { detail: initial.detail, status: "ok" }
    : { detail: null, status: "unavailable" };
}

/** A separate keyed session prevents a previous token's response or UI state leaking into this address. */
export function TokenLive(props: TokenLiveProps) {
  return <TokenLiveSession key={props.address} {...props} />;
}

function TokenLiveSession({ address, initial }: TokenLiveProps) {
  const { t } = useI18n();
  const [state, setState] = useState(() => initialState(initial, address));

  useEffect(() => {
    if (!isTokenAddress(address)) return;
    let disposed = false;
    let pending: AbortController | null = null;
    const load = async () => {
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetch(`/api/live/token/${encodeURIComponent(address)}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          cache: "no-store",
        });
        if (disposed || controller.signal.aborted) return;
        if (response.status === 404) {
          setState({ detail: null, status: "not-found" });
          return;
        }
        if (!response.ok) throw new Error("Token data unavailable");
        const detail: unknown = await response.json();
        if (disposed || controller.signal.aborted) return;
        if (!isLiveTokenDetail(detail, address)) throw new Error("Invalid token data");
        setState({ detail, status: "ok" });
      } catch {
        if (!disposed && !controller.signal.aborted) setState((previous) => ({ ...previous, status: "unavailable" }));
      } finally {
        if (pending === controller) pending = null;
      }
    };
    if (initialState(initial, address).status !== "ok") void load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refreshVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
    // The initial response seeds this address once; polling owns subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (!state.detail) {
    return (
      <section role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-bold">{t.meta.token}</h1>
        <p className="text-sm text-text-2">{state.status === "not-found" ? t.token.live.notFound : t.token.live.failed}</p>
      </section>
    );
  }
  return (
    <>
      {state.status === "unavailable" ? <p role="status" className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">{t.token.live.stale}</p> : null}
      <TokenView detail={state.detail} />
    </>
  );
}
