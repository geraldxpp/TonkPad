/**
 * Helius DAS getAssetBatch: each token's art, its name and symbol (some
 * launch events arrive without them), its supply, and who holds the mint and
 * freeze authorities (if anyone). Up to 1,000 ids per call.
 */
export const ASSET_BATCH = 100;

export interface AssetInfo {
  /** The art link from the token's metadata, as published (see art.ts for what the app shows). */
  image: string | null;
  name: string | null;
  symbol: string | null;
  /** null when Helius doesn't say (then the score counts it as unknown, not safe). */
  mintRevoked: boolean | null;
  freezeRevoked: boolean | null;
  /** Who holds each authority, for matching verified issuers (issuers.ts). */
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Total supply in raw units, for the top-10 holder share. */
  supply: number | null;
}

interface DasAsset {
  id?: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
    files?: Array<{ uri?: string }>;
  };
  token_info?: { mint_authority?: string | null; freeze_authority?: string | null; supply?: number };
}

const text = (value: string | undefined) => value?.trim() || null;

export function toAssetInfo(asset: DasAsset): AssetInfo {
  return {
    image: text(asset.content?.links?.image) ?? text(asset.content?.files?.[0]?.uri),
    name: text(asset.content?.metadata?.name),
    symbol: text(asset.content?.metadata?.symbol),
    mintRevoked: asset.token_info ? !asset.token_info.mint_authority : null,
    freezeRevoked: asset.token_info ? !asset.token_info.freeze_authority : null,
    mintAuthority: asset.token_info?.mint_authority || null,
    freezeAuthority: asset.token_info?.freeze_authority || null,
    supply: typeof asset.token_info?.supply === "number" && asset.token_info.supply > 0 ? asset.token_info.supply : null,
  };
}

export async function fetchAssets(apiKey: string, ids: readonly string[]): Promise<Map<string, AssetInfo>> {
  const out = new Map<string, AssetInfo>();
  if (ids.length === 0) return out;
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "assets", method: "getAssetBatch", params: { ids } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Helius HTTP ${res.status}`);
  const body = (await res.json()) as { result?: Array<DasAsset | null> };
  for (const asset of body.result ?? []) {
    if (asset?.id) out.set(asset.id, toAssetInfo(asset));
  }
  return out;
}
