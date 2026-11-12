"use client";

import { useEffect, useRef } from "react";
import { fetchLaunches, fetchPrices } from "./api";
import { runCheck } from "./engine";
import { CHECK_NOW } from "./hooks";
import { RULES_KEY, SETTINGS_KEY } from "./storage";
import type { FeedItem } from "./types";

/** How often the open tab checks. */
export const CHECK_EVERY_MS = 30_000;

interface EngineOptions {
  enabled: boolean;
  launchpad: boolean;
  onFired: (items: FeedItem[]) => void;
  /** False while live prices can't be read. */
  onStatus: (ok: boolean) => void;
}

/**
 * Runs the checks while the site is open: every 30 seconds, and at once when
 * a rule is added or the tab comes back into view. Only one tab checks: the
 * browser's Web Locks hand the job to another tab when this one closes, so a
 * visitor with several tabs open gets each alert once.
 */
export function useAlertsEngine({ enabled, launchpad, onFired, onStatus }: EngineOptions): void {
  const callbacks = useRef({ onFired, onStatus });
  useEffect(() => {
    callbacks.current = { onFired, onStatus };
  });
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let again = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const deps = { fetchPrices, fetchLaunches: launchpad ? fetchLaunches : null, now: Date.now };

    const tick = async () => {
      if (stopped) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        const items = await runCheck(deps);
        if (!stopped) {
          callbacks.current.onStatus(true);
          if (items.length > 0) callbacks.current.onFired(items);
        }
      } catch {
        if (!stopped) callbacks.current.onStatus(false);
      } finally {
        running = false;
        if (again && !stopped) {
          again = false;
          void tick();
        }
      }
    };
    const onCheck = () => void tick();
    const onStorage = (event: StorageEvent) => {
      if (event.key === RULES_KEY || event.key === SETTINGS_KEY) void tick();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    const lead = () => {
      if (stopped) return;
      void tick();
      timer = setInterval(onCheck, CHECK_EVERY_MS);
      window.addEventListener(CHECK_NOW, onCheck);
      window.addEventListener("storage", onStorage);
      document.addEventListener("visibilitychange", onVisible);
    };

    let release: (() => void) | undefined;
    const controller = new AbortController();
    if (typeof navigator !== "undefined" && navigator.locks) {
      navigator.locks
        .request("tonkpad-alerts", { signal: controller.signal }, () => new Promise<void>((resolve) => {
          release = resolve;
          lead();
        }))
        .catch(() => undefined);
    } else {
      lead();
    }
    return () => {
      stopped = true;
      controller.abort();
      release?.();
      clearInterval(timer);
      window.removeEventListener(CHECK_NOW, onCheck);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, launchpad]);
}
