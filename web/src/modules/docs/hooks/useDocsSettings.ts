"use client";

import { usePolling } from "@/shared/live/usePolling";
import { isSettings, SETTINGS_PATH } from "@/shared/tonk/api";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import type { DocsData } from "../data/get-docs-data";

/** The settings change rarely (a pause, a new fee), so a minute between reads is plenty. */
export const DOCS_REFRESH_MS = 60_000;

export interface DocsSettings {
  /** The launchpad's settings; null while they can't be read (or before the first answer). */
  settings: TonkSettingsJson | null;
  /** True until the first read has answered, one way or the other. */
  pending: boolean;
}

/**
 * The launchpad's settings for the Docs page. Where a launchpad is
 * connected they are read from /api/tonk/settings, as the Creator Studio
 * reads them, and again every minute; a failed read keeps the last good
 * answer. The demo keeps its fixed settings and never asks.
 */
export function useDocsSettings(data: DocsData): DocsSettings {
  const live = data.source === "live";
  const { data: polled, loading, error } = usePolling<unknown>(live ? SETTINGS_PATH : null, data.settings, DOCS_REFRESH_MS);
  return { settings: isSettings(polled) ? polled : null, pending: live && loading && !error };
}
