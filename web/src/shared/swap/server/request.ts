import { isChainId } from "@/shared/config/chains";
import { isChainAddress } from "@/shared/lib/address";
import { isRecord, SwapError } from "./config";
import type { SwapRequest } from "./engine";

const NO_STORE = { "cache-control": "no-store" };

/** Slippage the swap accepts: 0.1%–10% (10–1000 bps). */
const SLIPPAGE = { min: 10, max: 1_000 };

/**
 * A swap request from query params or a JSON body, checked field by field:
 * the chain, two different addresses in its format, a whole positive raw
 * amount, the slippage and (optionally) the taker's address.
 */
export function parseSwapRequest(input: Record<string, unknown>): SwapRequest {
  const { chain, from, to, amount, slippageBps, taker } = input;
  if (typeof chain !== "string" || !isChainId(chain)) throw new SwapError("invalid", "bad chain", 400);
  if (typeof from !== "string" || typeof to !== "string" || !isChainAddress(chain, from) || !isChainAddress(chain, to)) {
    throw new SwapError("invalid", "bad token", 400);
  }
  if ((chain === "rh" ? from.toLowerCase() === to.toLowerCase() : from === to)) throw new SwapError("invalid", "same token", 400);
  if (typeof amount !== "string" || !/^[1-9]\d{0,39}$/.test(amount)) throw new SwapError("invalid", "bad amount", 400);
  const slippage = Number(slippageBps);
  if (!Number.isInteger(slippage) || slippage < SLIPPAGE.min || slippage > SLIPPAGE.max) throw new SwapError("invalid", "bad slippage", 400);
  if (taker !== undefined && taker !== null && taker !== "" && (typeof taker !== "string" || !isChainAddress(chain, taker))) {
    throw new SwapError("invalid", "bad wallet", 400);
  }
  return { chain, from, to, amount, slippageBps: slippage, taker: typeof taker === "string" && taker ? taker : null };
}

/** Query params as a plain record. */
export function queryRecord(request: Request): Record<string, unknown> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

/** A JSON body as a plain record (empty when it isn't one). */
export async function bodyRecord(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return isRecord(body) ? body : {};
}

/** The response for a failure: its code for the browser, never the upstream detail (which could name a provider URL). */
export function errorResponse(error: unknown, extra: Record<string, unknown> = {}): Response {
  if (error instanceof SwapError) return Response.json({ error: error.code, ...extra }, { status: error.status, headers: NO_STORE });
  return Response.json({ error: "unavailable", ...extra }, { status: 502, headers: NO_STORE });
}

export function jsonResponse(body: unknown, cacheSeconds = 0): Response {
  const headers = cacheSeconds > 0 ? { "cache-control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` } : NO_STORE;
  return Response.json(body, { headers });
}
