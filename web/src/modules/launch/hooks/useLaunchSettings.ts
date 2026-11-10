"use client";

import { useMemo } from "react";
import { usePolling } from "@/shared/live/usePolling";
import { isSettings, SETTINGS_PATH } from "@/shared/tonk/api";
import type { CurveSettings } from "@/shared/tonk/curve";
import { curveSettings, type TonkSettingsJson } from "@/shared/tonk/types";
import { type LaunchData, MOCK_SETTINGS } from "../data/get-launch-data";

export const SETTINGS_REFRESH_MS = 15_000;

export interface LiveSettings {
  settings: CurveSettings;
  paused: boolean;
  /** The chain's gas price in wei, when known. */
  gasPrice: bigint | null;
  /** True while the live settings can't be read: the figures may be out of date, and nothing can launch. */
  offline: boolean;
}

/**
 * The launchpad's settings: what the server read for the first paint, then
 * refreshed from /api/tonk/settings every 15 s on the testnet site. The demo
 * keeps its mock settings and never asks.
 */
export function useLaunchSettings(data: LaunchData, fresh: TonkSettingsJson | null = null): LiveSettings {
  const live = data.mode === "testnet";
  const { data: polled, error } = usePolling<TonkSettingsJson | null>(live ? SETTINGS_PATH : null, data.settings, SETTINGS_REFRESH_MS, data.settings ? SETTINGS_PATH : null);
  const last = isSettings(polled) ? polled : null;
  // What the server read while building a launch is newer than the last poll until the next one lands.
  const json = fresh && (!last || fresh.readAt > last.readAt) ? fresh : last;
  return useMemo(() => {
    const source = json ?? MOCK_SETTINGS;
    return { settings: curveSettings(source), paused: source.paused, gasPrice: source.gasPrice ? BigInt(source.gasPrice) : null, offline: live && (json === null || error) };
  }, [json, live, error]);
}
