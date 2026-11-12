import { getTokenData } from "@/modules/token/data/get-token-data";
import { ALERT_CACHE, routeIds } from "@/shared/alerts/server";
import { fetchWorkerText, isLiveMode } from "@/shared/live/server";
import { tonkMode } from "@/shared/tonk/networks";
import type { LivePrice } from "@/shared/types/live";

/** The demo's prices: each mock token's own, swaying 5% either way over two minutes, so an alert can fire. */
async function mockPrices(ids: readonly string[], now: number): Promise<LivePrice[]> {
  const prices: LivePrice[] = [];
  for (const [index, id] of ids.entries()) {
    const detail = await getTokenData(id);
    if (!detail?.priceUsd) continue;
    const sway = 0.05 * Math.sin((2 * Math.PI * now) / 120_000 + index);
    const { token } = detail;
    prices.push({ address: token.address, chain: token.chain, symbol: token.ticker, name: token.name, priceUsd: detail.priceUsd * (1 + sway), marketCap: token.marketCap * (1 + sway), change1h: sway * 100, change24h: token.change24h, at: now });
  }
  return prices;
}

/**
 * GET /api/live/prices?ids=… → prices for up to 25 tokens, what alerts check:
 * the worker's /v1/prices in live mode (it never marks a token opened, so it
 * spends no Helius credits), the demo's swaying mock prices otherwise.
 */
export async function GET(request: Request) {
  if (tonkMode() === "testnet") return Response.json({ error: "closed" }, { status: 404 });
  const ids = routeIds(request);
  if (!isLiveMode()) return Response.json({ prices: await mockPrices(ids, Date.now()) }, { headers: { "cache-control": "no-store" } });
  if (ids.length === 0) return Response.json({ prices: [] }, { headers: ALERT_CACHE });
  try {
    const body = await fetchWorkerText(`/v1/prices?ids=${encodeURIComponent(ids.join(","))}`);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", ...ALERT_CACHE } });
  } catch {
    return Response.json({ error: "live data unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
