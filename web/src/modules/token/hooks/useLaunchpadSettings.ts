"use client";

import { useEffect, useState } from "react";
import { fetchSettings } from "@/shared/tonk/api";
import type { TonkSettingsJson } from "@/shared/tonk/types";

/** The launchpad's own settings, read once: the buy presets follow its virtual reserve, and Max keeps back gas at its price. */
export function useLaunchpadSettings(): TonkSettingsJson | null {
  const [settings, setSettings] = useState<TonkSettingsJson | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchSettings(controller.signal).then(setSettings, () => undefined);
    return () => controller.abort();
  }, []);
  return settings;
}
