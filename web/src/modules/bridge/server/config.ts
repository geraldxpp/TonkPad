import { isTestnetSite } from "@/shared/tonk/networks";

export interface BridgeConfig {
  relayKey: string | null;
  acrossKey: string | null;
  acrossIntegrator: string | null;
  lifiKey: string | null;
  /** The go-live switch: BRIDGE_TRADING=on lets the server build real transfers. Quotes work either way. */
  tradingOpen: boolean;
  /** BRIDGE_PROVIDERS=off in the test builds, so nothing can reach a provider. */
  providersOn: boolean;
}

const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

/** The bridge's server settings; none is NEXT_PUBLIC_, so none reaches the browser. */
export function bridgeConfig(env: Readonly<Record<string, string | undefined>> = process.env): BridgeConfig {
  return {
    relayKey: value(env.RELAY_API_KEY),
    acrossKey: value(env.ACROSS_API_KEY),
    acrossIntegrator: value(env.ACROSS_INTEGRATOR_ID),
    lifiKey: value(env.LIFI_API_KEY),
    tradingOpen: value(env.BRIDGE_TRADING) === "on" && !isTestnetSite(),
    providersOn: value(env.BRIDGE_PROVIDERS) !== "off",
  };
}

export type BridgeErrorCode = "no-route" | "too-small" | "too-large" | "price-moved" | "expired" | "unavailable" | "busy" | "closed" | "invalid";

/** A failure the route can explain, as a code the browser turns into words. Never a provider's own text. */
export class BridgeError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export const isRecord = (input: unknown): input is Record<string, unknown> => typeof input === "object" && input !== null && !Array.isArray(input);
export const isDigits = (input: unknown): input is string => typeof input === "string" && /^\d+$/.test(input);

/** A finite number from JSON that may spell it as a string; null otherwise. */
export function numberOf(input: unknown): number | null {
  const parsed = typeof input === "number" ? input : typeof input === "string" && input.trim() !== "" ? Number(input) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export interface JsonAnswer {
  status: number;
  body: unknown;
}

/** Calls a provider. Rate limits become "busy", a failed connection "unavailable"; errors never name a URL or key. */
export async function fetchJson(url: string, init: RequestInit, label: string): Promise<JsonAnswer> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new BridgeError("unavailable", `${label}: no answer`);
  }
  if (res.status === 429) throw new BridgeError("busy", `${label}: rate limited`, 503);
  return { status: res.status, body: await res.json().catch(() => null) };
}
