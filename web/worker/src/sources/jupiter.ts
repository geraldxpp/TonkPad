/**
 * Jupiter's token list, as the second check on a verified issuer: the token
 * must be marked verified and carry the issuer's tag. A copycat can hand its
 * authorities to an issuer's address, but it can't get Jupiter's tag.
 */
interface JupiterToken {
  id?: string;
  isVerified?: boolean;
  tags?: unknown;
}

/** Whether a search result verifies `mint` under `tag`. */
export function jupiterVouches(results: unknown, mint: string, tag: string): boolean {
  if (!Array.isArray(results)) return false;
  const hit = (results as JupiterToken[]).find((token) => token?.id === mint);
  return hit?.isVerified === true && Array.isArray(hit.tags) && hit.tags.includes(tag);
}

export async function fetchJupiterVouch(apiKey: string, mint: string, tag: string): Promise<boolean> {
  const res = await fetch(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jupiter tokens HTTP ${res.status}`);
  return jupiterVouches(await res.json(), mint, tag);
}
