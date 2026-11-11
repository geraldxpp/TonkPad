import { RANGES, type PortfolioRange } from "@/modules/portfolio/lib/types";
import { cacheSecondsOf, readMarket } from "@/modules/portfolio/server/market";
import { overLimit } from "@/shared/lib/rate-limit";
import { isTestnetSite } from "@/shared/tonk/networks";

const NO_STORE = { "cache-control": "no-store" };
const isRange = (value: string | null): value is PortfolioRange => RANGES.includes(value as PortfolioRange);

/** SOL and ETH prices across a range, for the portfolio chart: GET /api/portfolio/market?range=1W. Nothing here is about a wallet. */
export async function GET(request: Request) {
  const limited = overLimit(request, "portfolioMarket");
  if (limited) return limited;
  if (isTestnetSite()) return Response.json({ error: "closed" }, { status: 404, headers: NO_STORE });
  const range = new URL(request.url).searchParams.get("range");
  if (!isRange(range)) return Response.json({ error: "invalid range" }, { status: 400, headers: NO_STORE });
  try {
    const seconds = cacheSecondsOf(range);
    return Response.json(await readMarket(range), { headers: { "cache-control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}` } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers: NO_STORE });
  }
}
