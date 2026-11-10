import { tonkNetwork, type TonkNetwork } from "../networks";
import { TonkError } from "./client";

const NO_STORE = { "cache-control": "no-store" };

/** The network this deployment's launchpad is on; "closed" where none is connected (production and mock builds). */
export function requireNetwork(): TonkNetwork {
  const network = tonkNetwork();
  if (!network) throw new TonkError("closed", "no launchpad network is connected", 404);
  return network;
}

/** A failure as its code for the browser, never cached and never with the upstream detail. */
export function tonkErrorResponse(error: unknown): Response {
  if (error instanceof TonkError) return Response.json({ error: error.code }, { status: error.status, headers: NO_STORE });
  return Response.json({ error: "unavailable" }, { status: 502, headers: NO_STORE });
}

export function tonkJson(body: unknown, cacheSeconds = 0): Response {
  const headers = cacheSeconds > 0 ? { "cache-control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}` } : NO_STORE;
  return Response.json(body, { headers });
}
