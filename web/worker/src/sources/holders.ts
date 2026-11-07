import { isWalletAddress } from "../solana";

/**
 * Top-10 holder share on Solana (Mission score v2). Helius returns a mint's 20
 * largest token accounts (1 credit) and a second call reads who owns each (1
 * credit); a token without a known supply costs a third. Accounts owned by
 * program addresses (bonding curves, pools, lock escrows) and burn addresses
 * aren't people, so they are left out, and one wallet's accounts count together.
 */
const BURN_OWNERS: ReadonlySet<string> = new Set(["1nc1nerator11111111111111111111111111111111"]);

export interface HolderBalance {
  owner: string;
  /** Raw token units. */
  amount: number;
}

export interface HolderCheck {
  /** Share of supply the 10 largest wallets hold, 0–1; null when it can't be told. */
  share: number | null;
  /** Total supply in raw units, when known. */
  supply: number | null;
  /** The wallets among the largest accounts, biggest first (for smart money). */
  wallets: string[];
  /** The same wallets with their balances in raw units. */
  ranked: HolderBalance[];
  /** Token accounts that own themselves: how Streamflow escrows hold locked tokens (sources/streamflow.ts). */
  escrows: Array<{ account: string; amount: number }>;
}

/** People's wallets among `balances`, one entry per wallet, biggest first. */
export function rankWallets(balances: readonly HolderBalance[]): HolderBalance[] {
  const byOwner = new Map<string, number>();
  for (const { owner, amount } of balances) {
    if (BURN_OWNERS.has(owner) || !isWalletAddress(owner)) continue;
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + amount);
  }
  return [...byOwner].map(([owner, amount]) => ({ owner, amount })).sort((a, b) => b.amount - a.amount);
}

/** The share of `supply` held by the `top` largest wallets among `balances`. */
export function topHolderShare(balances: readonly HolderBalance[], supply: number, top = 10): number | null {
  if (!(supply > 0)) return null;
  const held = rankWallets(balances)
    .slice(0, top)
    .reduce((sum, wallet) => sum + wallet.amount, 0);
  return Math.min(1, held / supply);
}

interface ParsedTokenAccount {
  data?: { parsed?: { info?: { owner?: unknown } } };
}

export async function heliusRpc<T>(apiKey: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Helius HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.result === undefined) throw new Error(`Helius ${method}: ${body.error?.message ?? "no result"}`);
  return body.result;
}

/** Measures a mint's top-10 holder share; `onCall` runs once per Helius call (1 credit each). */
export async function fetchTopHolders(
  apiKey: string,
  mint: string,
  knownSupply: number | null,
  onCall: () => void,
): Promise<HolderCheck> {
  onCall();
  const largest = await heliusRpc<{ value: Array<{ address: string; amount: string }> }>(apiKey, "getTokenLargestAccounts", [mint]);
  let supply = knownSupply;
  if (supply === null) {
    onCall();
    const total = await heliusRpc<{ value: { amount: string } }>(apiKey, "getTokenSupply", [mint]);
    supply = Number(total.value.amount);
  }
  if (largest.value.length === 0) return { share: null, supply, wallets: [], ranked: [], escrows: [] };
  onCall();
  const accounts = await heliusRpc<{ value: Array<ParsedTokenAccount | null> }>(apiKey, "getMultipleAccounts", [
    largest.value.map((account) => account.address),
    { encoding: "jsonParsed" },
  ]);
  const balances = largest.value.flatMap((account, i): HolderBalance[] => {
    const owner = accounts.value[i]?.data?.parsed?.info?.owner;
    return typeof owner === "string" ? [{ owner, amount: Number(account.amount) }] : [];
  });
  const escrows = largest.value
    .filter((account, i) => accounts.value[i]?.data?.parsed?.info?.owner === account.address)
    .map((account) => ({ account: account.address, amount: Number(account.amount) }));
  const ranked = rankWallets(balances);
  return { share: topHolderShare(balances, supply), supply, wallets: ranked.map((wallet) => wallet.owner), ranked, escrows };
}
