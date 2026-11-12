"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useShellLive } from "@/modules/shell/live/ShellLive";
import type { DocsData } from "../data/get-docs-data";
import { useDocsSettings } from "../hooks/useDocsSettings";
import { docsFigures } from "../lib/figures";
import type { DocsLiveValue, UsdPrice } from "../lib/live";

const DocsLiveContext = createContext<DocsLiveValue>({ figures: null, pending: false, source: "none", chainName: null, unit: "ETH", usd: "off" });

/** Reads the launchpad once for the whole page and hands its figures to every section that shows one. */
export function DocsLiveProvider({ data, children }: { data: DocsData; children: ReactNode }) {
  const { settings, pending } = useDocsSettings(data);
  const shell = useShellLive();
  // Mainnet counts in dollars at the live ETH price, as its token pages do; nowhere else has a dollar price.
  const price = shell.data?.status.ethUsd ?? null;
  const usd: UsdPrice = data.mode !== "mainnet" ? "off" : price !== null ? price : shell.live && !shell.data && !shell.failed ? "pending" : "unavailable";
  const value = useMemo<DocsLiveValue>(
    () => ({ figures: settings ? docsFigures(settings) : null, pending, source: data.source, chainName: data.chainName, unit: data.unit, usd }),
    [settings, pending, data.source, data.chainName, data.unit, usd],
  );
  return <DocsLiveContext value={value}>{children}</DocsLiveContext>;
}

export function useDocsLive(): DocsLiveValue {
  return useContext(DocsLiveContext);
}
