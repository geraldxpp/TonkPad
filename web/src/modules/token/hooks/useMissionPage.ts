"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMission, TonkApiError } from "@/shared/tonk/api";
import type { MissionJson, MissionPageJson } from "@/shared/tonk/mission";

const REFRESH_MS = 5_000;
/** The server shares one read of the chain for a couple of seconds, so a second look follows the first. */
const SECOND_LOOK_MS = 2_500;

/** What the server's first read of a mission came back with. */
export type MissionLoad = { status: "ok"; page: MissionPageJson } | { status: "not-found" } | { status: "unavailable" };

interface MissionState {
  page: MissionPageJson | null;
  status: MissionLoad["status"];
}

/** The newer of two reads of one mission, by the block each saw; the trades are always the latest asked for. */
export function newerPage(held: MissionPageJson | null, read: MissionPageJson): MissionPageJson {
  return held && held.mission.block > read.mission.block ? { mission: held.mission, trades: read.trades } : read;
}

/**
 * A mission kept fresh: read again every five seconds while the page is
 * visible, and at once (then once more) after something of the visitor's
 * confirms. A failed read keeps the last figures and says so; an address
 * that isn't a mission is "not found".
 */
export function useMissionPage(address: string, initial: MissionLoad) {
  const [state, setState] = useState<MissionState>(() => (initial.status === "ok" ? { page: initial.page, status: "ok" } : { page: null, status: initial.status }));
  const reload = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let again = false;
    let timer = 0;
    const load = async () => {
      // One read at a time; a refresh asked for meanwhile runs right after it.
      if (pending) {
        again = true;
        return;
      }
      const controller = new AbortController();
      pending = controller;
      try {
        const page = await fetchMission(address, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (!disposed) setState((prev) => ({ page: newerPage(prev.page, page), status: "ok" }));
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        if (error instanceof TonkApiError && (error.code === "missing" || error.code === "invalid")) setState({ page: null, status: "not-found" });
        else setState((prev) => (prev.status === "not-found" ? prev : { ...prev, status: "unavailable" }));
      } finally {
        if (pending === controller) pending = null;
        if (again && !disposed) {
          again = false;
          void load();
        }
      }
    };
    reload.current = () => {
      void load();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), SECOND_LOOK_MS);
    };
    if (initial.status === "unavailable") void load();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refreshVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(interval);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
    // The server's first read seeds this address once; from here the polling owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  /** Reads the chain again now: after a confirmed trade or action. */
  const refresh = useCallback(() => reload.current(), []);
  /** The server read newer state while checking a trade: the page takes it at once. */
  const onMission = useCallback((mission: MissionJson) => {
    setState((prev) => (prev.page && prev.page.mission.token === mission.token && mission.block >= prev.page.mission.block ? { status: "ok", page: { ...prev.page, mission } } : prev));
  }, []);
  return { ...state, refresh, onMission };
}
