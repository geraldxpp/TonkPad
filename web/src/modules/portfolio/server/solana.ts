import { SOL_MINT, USDC_MINT } from "@/shared/swap/tokens";
import { jsonRpc, type RpcCall } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import { type ChainPortfolio, NO_CHANGE, type PortfolioAsset, type TrackedCoin } from "../lib/types";
import { numeric, record, toAmount } from "./clean";
import { readSolanaTokens, type SolanaTokenInfo } from "./jupiter";

const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"] as const;
/** Mints priced per wallet: well past any real holder, and a limit on what one junk-filled wallet can cost. */
const MAX_MINTS = 1_000;
/** How many unpriced tokens are sent to the screen. */
export const MAX_UNPRICED = 100;

/** Stablecoins by address, never by ticker: anyone can name a token USDC. */
const STABLES = new Set([
  USDC_MINT,
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
  "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", // USDS
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", // USDG
]);
const TRACKED: Record<string, TrackedCoin> = { [SOL_MINT]: "SOL", "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH" };

export interface TokenHolding {
  raw: bigint;
  decimals: number;
}

/** A wallet's token accounts, added up per mint. NFTs (no decimals, one unit) and empty accounts are left out. */
export function sumTokenAccounts(value: unknown, into = new Map<string, TokenHolding>()): Map<string, TokenHolding> {
  const list = record(value) && Array.isArray(value.value) ? value.value : [];
  for (const entry of list) {
    const info = record(entry) && record(entry.account) && record(entry.account.data) && record(entry.account.data.parsed) ? entry.account.data.parsed.info : null;
    const amount = record(info) ? info.tokenAmount : null;
    if (!record(info) || typeof info.mint !== "string" || !record(amount) || typeof amount.amount !== "string" || !/^\d+$/.test(amount.amount)) continue;
    const decimals = numeric(amount.decimals);
    if (decimals === null || decimals === 0 || decimals > 36 || amount.amount === "0") continue;
    const held = into.get(info.mint);
    into.set(info.mint, { raw: (held?.raw ?? BigInt(0)) + BigInt(amount.amount), decimals });
  }
  return into;
}

function tokenAsset(mint: string, holding: TokenHolding, info: SolanaTokenInfo | undefined): PortfolioAsset {
  const balance = toAmount(holding.raw, holding.decimals);
  const price = info?.priceUsd ?? null;
  return {
    chain: "sol",
    address: mint,
    symbol: mint === SOL_MINT ? "WSOL" : (info?.symbol ?? mint.slice(0, 5).toUpperCase()),
    name: mint === SOL_MINT ? "Wrapped SOL" : (info?.name ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`),
    art: mint === SOL_MINT ? "/chains/sol.png" : mint === USDC_MINT ? "/coins/usdc.svg" : (info?.art ?? ""),
    decimals: holding.decimals,
    raw: String(holding.raw),
    balance,
    priceUsd: price,
    valueUsd: price === null ? null : balance * price,
    change: info?.change ?? NO_CHANGE,
    native: false,
    stable: STABLES.has(mint),
    track: TRACKED[mint] ?? null,
  };
}

/** Keeps every priced asset and a page of the rest, and counts what it left out. */
export function trimUnpriced(assets: readonly PortfolioAsset[]): { assets: PortfolioAsset[]; unpriced: number } {
  const priced = assets.filter((asset) => asset.priceUsd !== null);
  const unpriced = assets.filter((asset) => asset.priceUsd === null);
  return { assets: [...priced, ...unpriced.slice(0, MAX_UNPRICED)], unpriced: unpriced.length };
}

/**
 * Everything a Solana wallet holds: its SOL, and every token in both token
 * programs, named and priced by Jupiter. A token program that can't be read,
 * or prices that can't be had, leave the rest standing and mark the answer
 * partial; only the wallet's own SOL is essential.
 */
export async function readSolanaPortfolio(owner: string, rpc: RpcCall = jsonRpc(walletRpcUrl("sol"))): Promise<ChainPortfolio> {
  const config = { commitment: "confirmed" } as const;
  const [balance, ...accounts] = await Promise.allSettled([
    rpc("getBalance", [owner, config]),
    ...TOKEN_PROGRAMS.map((programId) => rpc("getTokenAccountsByOwner", [owner, { programId }, { ...config, encoding: "jsonParsed" }])),
  ]);
  const lamports = balance.status === "fulfilled" && record(balance.value) ? numeric(balance.value.value) : null;
  if (lamports === null || lamports < 0) throw new Error("getBalance: bad value");

  const holdings = new Map<string, TokenHolding>();
  for (const result of accounts) if (result.status === "fulfilled") sumTokenAccounts(result.value, holdings);
  const mints = [...holdings.keys()].slice(0, MAX_MINTS);
  const { tokens, failed } = await readSolanaTokens([SOL_MINT, ...mints]);

  const sol = tokens.get(SOL_MINT);
  const amount = lamports / 1e9;
  const native: PortfolioAsset = {
    chain: "sol",
    address: SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    art: "/chains/sol.png",
    decimals: 9,
    raw: String(lamports),
    balance: amount,
    priceUsd: sol?.priceUsd ?? null,
    valueUsd: sol?.priceUsd ? amount * sol.priceUsd : null,
    change: sol?.change ?? NO_CHANGE,
    native: true,
    stable: false,
    track: "SOL",
  };
  const list = mints.flatMap((mint) => {
    const holding = holdings.get(mint);
    return holding ? [tokenAsset(mint, holding, tokens.get(mint))] : [];
  });
  return {
    chain: "sol",
    owner,
    ...trimUnpriced([...(lamports > 0 ? [native] : []), ...list]),
    partial: failed || accounts.some((result) => result.status === "rejected") || holdings.size > MAX_MINTS,
    readAt: Date.now(),
  };
}
