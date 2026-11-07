/**
 * Jupiter's token list. It is the second check on a verified issuer: the token
 * must be marked verified and carry the issuer's tag (a copycat can hand its
 * authorities to an issuer's address, but it can't get Jupiter's tag). It also
 * counts each token's holders, up to 100 tokens a request, at no Helius cost.
 */
interface JupiterToken {
  id?: string;
  isVerified?: boolean;
  tags?: unknown;
  holderCount?: unknown;
}

/** Mints per search request. */
export const JUPITER_BATCH = 100;

async function search(apiKey: string, query: string): Promise<unknown> {
  const res = await fetch(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jupiter tokens HTTP ${res.status}`);
  return res.json();
}

/** Holder counts by mint from a search result. */
export function holderCounts(results: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(results)) return out;
  for (const token of results as Array<JupiterToken | null>) {
    const count = token?.holderCount;
    if (typeof token?.id === "string" && typeof count === "number" && Number.isFinite(count) && count >= 0) {
      out.set(token.id, Math.round(count));
    }
  }
  return out;
}

export async function fetchHolderCounts(apiKey: string, mints: readonly string[]): Promise<Map<string, number>> {
  if (mints.length === 0) return new Map();
  return holderCounts(await search(apiKey, mints.slice(0, JUPITER_BATCH).join(",")));
}

/** Whether a search result verifies `mint` under `tag`. */
export function jupiterVouches(results: unknown, mint: string, tag: string): boolean {
  if (!Array.isArray(results)) return false;
  const hit = (results as JupiterToken[]).find((token) => token?.id === mint);
  return hit?.isVerified === true && Array.isArray(hit.tags) && hit.tags.includes(tag);
}

export async function fetchJupiterVouch(apiKey: string, mint: string, tag: string): Promise<boolean> {
  return jupiterVouches(await search(apiKey, mint), mint, tag);
}
