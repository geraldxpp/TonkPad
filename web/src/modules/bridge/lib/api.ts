import type { BridgeBuild, BridgeQuote, BridgeStatus, RecentTransfer } from "./types";

/** A transfer as the browser asks for it: networks and assets by their short names, the amount in base units. */
export interface RoutesRequest {
  from: string;
  to: string;
  asset: string;
  receive: string;
  amount: string;
  sender: string | null;
  recipient: string | null;
  gasTopUp: boolean;
}

/** The server's reason, as a code the UI turns into words. */
export class BridgeApiError extends Error {
  constructor(
    readonly code: string,
    /** The go-live switch, when the server said. */
    readonly tradingOpen: boolean | null = null,
  ) {
    super(code);
    this.name = "BridgeApiError";
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function call<T>(input: string, check: (body: unknown) => body is T, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BridgeApiError("offline");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new BridgeApiError(record(body) && typeof body.error === "string" ? body.error : "unavailable", record(body) && typeof body.tradingOpen === "boolean" ? body.tradingOpen : null);
  if (!check(body)) throw new BridgeApiError("unavailable");
  return body;
}

const isRoute = (value: unknown) => record(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.outAmount === "string" && typeof value.minOut === "string" && typeof value.etaSeconds === "number";

export const isQuote = (body: unknown): body is BridgeQuote => record(body) && Array.isArray(body.routes) && body.routes.every(isRoute) && typeof body.tradingOpen === "boolean";

export const isBuild = (body: unknown): body is BridgeBuild => record(body) && isRoute(body.route) && Array.isArray(body.approvals) && record(body.tracking) && (record(body.evm) || record(body.solana));

const STATES = new Set(["source", "transit", "delivered", "refunded", "failed"]);
export const isStatus = (body: unknown): body is BridgeStatus => record(body) && typeof body.state === "string" && STATES.has(body.state);

const query = (request: RoutesRequest) => {
  const params = new URLSearchParams({ from: request.from, to: request.to, asset: request.asset, receive: request.receive, amount: request.amount });
  if (request.sender) params.set("sender", request.sender);
  if (request.recipient) params.set("recipient", request.recipient);
  if (request.gasTopUp) params.set("gasTopUp", "1");
  return params;
};

export const fetchRoutes = (request: RoutesRequest, signal?: AbortSignal): Promise<BridgeQuote> => call(`/api/bridge/quote?${query(request)}`, isQuote, { signal });

export function fetchBuild(request: RoutesRequest & { routeId: string; reviewedOut: string }): Promise<BridgeBuild> {
  return call("/api/bridge/build", isBuild, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
}

export function sendSolana(transaction: string): Promise<{ signature: string }> {
  return call("/api/bridge/send", (body): body is { signature: string } => record(body) && typeof body.signature === "string", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction }),
  });
}

export function fetchTxState(network: string, tx: string): Promise<"pending" | "confirmed" | "failed"> {
  return call(`/api/bridge/tx?${new URLSearchParams({ network, tx })}`, (body): body is { state: "pending" | "confirmed" | "failed" } => record(body) && (body.state === "pending" || body.state === "confirmed" || body.state === "failed")).then((body) => body.state);
}

export function fetchStatus(transfer: RecentTransfer): Promise<BridgeStatus> {
  const params = new URLSearchParams({ from: transfer.from.network, to: transfer.to.network, tx: transfer.sourceTx, provider: transfer.tracking.provider, sender: transfer.sender, raw: transfer.raw });
  if (transfer.tracking.requestId) params.set("requestId", transfer.tracking.requestId);
  if (transfer.tracking.tool) params.set("tool", transfer.tracking.tool);
  return call(`/api/bridge/status?${params}`, isStatus);
}

export const balancePath = (network: string, owner: string, asset: string | null): string => `/api/bridge/balance/${network}/${encodeURIComponent(owner)}${asset ? `?asset=${encodeURIComponent(asset)}` : ""}`;
