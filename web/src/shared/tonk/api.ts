import type { LaunchBuild, LaunchRequest, LaunchStatus, TonkSettingsJson } from "./types";

/** The server's reason, as a code the screen turns into words: "paused", "funds", "refused", "busy", "unavailable"… */
export class TonkApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TonkApiError";
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function call<T>(input: string, check: (body: unknown) => body is T, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TonkApiError("unavailable");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new TonkApiError(record(body) && typeof body.error === "string" ? body.error : "unavailable");
  if (!check(body)) throw new TonkApiError("unavailable");
  return body;
}

export const SETTINGS_PATH = "/api/tonk/settings";

export const isSettings = (body: unknown): body is TonkSettingsJson =>
  record(body) && typeof body.launchFee === "string" && typeof body.virtualEth === "string" && typeof body.virtualTokens === "string" && typeof body.paused === "boolean";

const isBuild = (body: unknown): body is LaunchBuild =>
  record(body) && record(body.tx) && typeof body.tx.to === "string" && typeof body.tx.data === "string" && typeof body.tx.value === "string" && isSettings(body.settings);

const isStatus = (body: unknown): body is LaunchStatus => record(body) && typeof body.state === "string" && (body.mission === null || record(body.mission));

/** The launchpad's settings, read fresh. */
export function fetchSettings(signal?: AbortSignal): Promise<TonkSettingsJson> {
  return call(SETTINGS_PATH, isSettings, { signal });
}

/** Asks the server to check a launch against the contract and build its transaction. Nothing is sent. */
export function buildLaunch(request: LaunchRequest): Promise<LaunchBuild> {
  return call("/api/tonk/launch", isBuild, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
}

export function fetchLaunchStatus(hash: string): Promise<LaunchStatus> {
  return call(`/api/tonk/tx?${new URLSearchParams({ hash })}`, isStatus);
}
