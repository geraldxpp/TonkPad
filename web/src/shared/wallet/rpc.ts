import type { RawAmount } from "./units";

/** One JSON-RPC request; resolves with `result` or throws. Tests pass a fake. */
export type RpcCall = (method: string, params: readonly unknown[]) => Promise<unknown>;

/**
 * JSON-RPC over HTTP. Errors never carry the URL: provider URLs can hold an
 * API key (Helius, Alchemy), so they must not reach logs or responses.
 */
export function jsonRpc(url: string, fetchImpl: typeof fetch = fetch): RpcCall {
  let id = 0;
  return async (method, params) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null) throw new Error(`RPC ${method}: bad response`);
    if ("error" in body && body.error) throw new Error(`RPC ${method}: error`);
    if (!("result" in body)) throw new Error(`RPC ${method}: no result`);
    return body.result;
  };
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const digits = (value: unknown): value is string => typeof value === "string" && /^\d+$/.test(value);

export interface ChainBalances {
  native: RawAmount;
  /** Null when no token was asked for. */
  token: RawAmount | null;
}

/** SOL (lamports, 9 decimals) and the wallet's total in every account of the token's mint. */
export async function readSolanaBalances(rpc: RpcCall, owner: string, mint: string | null): Promise<ChainBalances> {
  const config = { commitment: "confirmed" } as const;
  const [balance, accounts] = await Promise.all([
    rpc("getBalance", [owner, config]),
    mint ? rpc("getTokenAccountsByOwner", [owner, { mint }, { ...config, encoding: "jsonParsed" }]) : null,
  ]);
  const lamports = record(balance) ? balance.value : undefined;
  if (typeof lamports !== "number" || !Number.isSafeInteger(lamports) || lamports < 0) throw new Error("getBalance: bad value");
  const native = { raw: String(lamports), decimals: 9 };
  if (!mint) return { native, token: null };
  const list = record(accounts) && Array.isArray(accounts.value) ? accounts.value : null;
  if (!list) throw new Error("getTokenAccountsByOwner: bad value");
  let total = BigInt(0);
  let decimals = 0;
  for (const entry of list) {
    const info = record(entry) && record(entry.account) && record(entry.account.data) && record(entry.account.data.parsed)
      ? entry.account.data.parsed.info
      : undefined;
    const amount = record(info) ? info.tokenAmount : undefined;
    if (!record(amount) || !digits(amount.amount) || typeof amount.decimals !== "number") throw new Error("token account: bad value");
    total += BigInt(amount.amount);
    decimals = amount.decimals;
  }
  return { native, token: { raw: total.toString(), decimals } };
}

const BALANCE_OF = "0x70a08231";
const DECIMALS = "0x313ce567";
const word = (hex: unknown, method: string): bigint => {
  if (typeof hex !== "string" || !/^0x[\da-fA-F]{1,64}$/.test(hex)) throw new Error(`${method}: bad value`);
  return BigInt(hex);
};

/** ETH (wei, 18 decimals) and the ERC-20 balance, read with balanceOf and decimals. */
export async function readEvmBalances(rpc: RpcCall, owner: string, token: string | null): Promise<ChainBalances> {
  const padded = owner.slice(2).toLowerCase().padStart(64, "0");
  const [wei, held, places] = await Promise.all([
    rpc("eth_getBalance", [owner, "latest"]),
    token ? rpc("eth_call", [{ to: token, data: `${BALANCE_OF}${padded}` }, "latest"]) : null,
    token ? rpc("eth_call", [{ to: token, data: DECIMALS }, "latest"]) : null,
  ]);
  const native = { raw: word(wei, "eth_getBalance").toString(), decimals: 18 };
  if (!token) return { native, token: null };
  const decimals = Number(word(places, "decimals"));
  if (decimals > 36) throw new Error("decimals: out of range");
  return { native, token: { raw: word(held, "balanceOf").toString(), decimals } };
}
