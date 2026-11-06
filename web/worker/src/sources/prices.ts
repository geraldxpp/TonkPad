/** SOL and ETH in USD from Jupiter's price API (ETH via Wormhole ETH on Solana). */
const SOL = "So11111111111111111111111111111111111111112";
const ETH = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";

export async function fetchNativePrices(apiKey: string): Promise<{ solUsd: number | null; ethUsd: number | null }> {
  const res = await fetch(`https://api.jup.ag/price/v3?ids=${SOL},${ETH}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Jupiter HTTP ${res.status}`);
  const body = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
  const price = (id: string) => {
    const v = body[id]?.usdPrice;
    return typeof v === "number" && v > 0 ? v : null;
  };
  return { solUsd: price(SOL), ethUsd: price(ETH) };
}

/** Robinhood Chain's gas price in gwei. */
export async function fetchGasGwei(rpcUrl: string): Promise<number | null> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Robinhood RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: string };
  return body.result ? parseInt(body.result, 16) / 1e9 : null;
}
