import type { ChainId } from "@/shared/types/chain";
import type { SwapBuild, SwapQuote, SwapToken, SwapTxState } from "@/shared/types/swap";

/** A swap request from the browser: what to trade, how much (raw units) and the slippage; the taker once a wallet is connected. */
export interface QuoteRequest {
  chain: ChainId;
  from: string;
  to: string;
  amount: string;
  slippageBps: number;
  taker?: string | null;
}

/** The server's reason, as a code the UI turns into words: "no-route", "busy", "closed", "expired", "unavailable"… */
export class SwapApiError extends Error {
  constructor(
    readonly code: string,
    /** The go-live switch, when the server said. */
    readonly tradingOpen: boolean | null = null,
  ) {
    super(code);
    this.name = "SwapApiError";
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function call<T>(input: string, check: (body: unknown) => body is T, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { ...init, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new SwapApiError("offline");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = record(body) && typeof body.error === "string" ? body.error : "unavailable";
    throw new SwapApiError(code, record(body) && typeof body.tradingOpen === "boolean" ? body.tradingOpen : null);
  }
  if (!check(body)) throw new SwapApiError("unavailable");
  return body;
}

const isQuote = (body: unknown): body is SwapQuote =>
  record(body) && typeof body.outAmount === "string" && typeof body.minOut === "string" && typeof body.tradingOpen === "boolean";

const isBuild = (body: unknown): body is SwapBuild => record(body) && isQuote(body.quote) && (record(body.solana) || record(body.evm));

const isToken = (body: unknown): body is SwapToken =>
  record(body) && typeof body.address === "string" && typeof body.symbol === "string" && typeof body.decimals === "number";

const query = (request: QuoteRequest) => {
  const params = new URLSearchParams({
    chain: request.chain,
    from: request.from,
    to: request.to,
    amount: request.amount,
    slippageBps: String(request.slippageBps),
  });
  if (request.taker) params.set("taker", request.taker);
  return params;
};

export function fetchQuote(request: QuoteRequest, signal?: AbortSignal): Promise<SwapQuote> {
  return call(`/api/swap/quote?${query(request)}`, isQuote, { signal });
}

export function fetchBuild(request: QuoteRequest & { taker: string }): Promise<SwapBuild> {
  return call("/api/swap/build", isBuild, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function sendSolana(transaction: string): Promise<{ signature: string }> {
  return call("/api/swap/send", (body): body is { signature: string } => record(body) && typeof body.signature === "string", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transaction }),
  });
}

export function fetchTxState(chain: ChainId, tx: string): Promise<SwapTxState> {
  return call(
    `/api/swap/status?${new URLSearchParams({ chain, tx })}`,
    (body): body is { state: SwapTxState } => record(body) && (body.state === "pending" || body.state === "confirmed" || body.state === "failed"),
  ).then((body) => body.state);
}

export function fetchToken(chain: ChainId, address: string, signal?: AbortSignal): Promise<SwapToken> {
  return call(`/api/swap/token?${new URLSearchParams({ chain, address })}`, isToken, { signal });
}
