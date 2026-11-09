import { cache } from "react";
import { workerUrl } from "@/shared/live/server";
import { isLiveTokenDetail, isTokenAddress, type LiveTokenResult } from "../lib/live-token";

/** The selected live address only; a worker failure never falls back to mock data. */
export const getLiveTokenData = cache(async (address: string): Promise<LiveTokenResult> => {
  if (!isTokenAddress(address)) return { status: "not-found" };
  const base = workerUrl();
  if (!base) return { status: "unavailable" };
  try {
    const token = process.env.WORKER_TOKEN?.trim();
    const response = await fetch(`${base}/v1/token/${encodeURIComponent(address)}`, {
      headers: token ? { "x-worker-token": token } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const detail: unknown = await response.json();
    return isLiveTokenDetail(detail, address) ? { status: "ok", detail } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
});
