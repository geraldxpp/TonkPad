import { NATIVE_EVM, USDG, WETH } from "@/shared/swap/tokens";
import { artUrl } from "@/shared/lib/token-art";
import { jsonRpc, type RpcCall } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import { type ChainPortfolio, NO_CHANGE, type PortfolioAsset } from "../lib/types";
import { cleanName, cleanSymbol, inChunks, numeric, record, toAmount } from "./clean";
import { readCurvePrices } from "./curve";
import { type DexPrice, readDexPrices } from "./dex";
import { trimUnpriced } from "./solana";

const PAGE = 100;
/** Pages of balances per wallet, and lookups at once. */
const MAX_PAGES = 5;
const PARALLEL = 20;
const META_TTL = 86_400_000;
const MAX_META = 30_000;
const BALANCE_OF = "0x70a08231";

const STABLES = new Set([USDG.toLowerCase()]);
/** The chain's base tokens, read directly when the RPC can't list a wallet's tokens. */
const BASE = [
  { address: USDG, symbol: "USDG", name: "Global Dollar", decimals: 6, art: "/coins/usdg.svg" },
  { address: WETH, symbol: "WETH", name: "Wrapped Ether", decimals: 18, art: "/coins/eth.svg" },
] as const;

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
  art: string;
}

const meta = new Map<string, { value: TokenMeta | null; at: number }>();

/** For tests. */
export const clearRobinhoodTokens = () => meta.clear();

/** The balances from a page of alchemy_getTokenBalances: non-zero ones only. */
export function parseTokenBalances(result: unknown): { balances: Map<string, bigint>; pageKey: string | null } {
  const balances = new Map<string, bigint>();
  const list = record(result) && Array.isArray(result.tokenBalances) ? result.tokenBalances : [];
  for (const entry of list) {
    if (!record(entry) || typeof entry.contractAddress !== "string" || typeof entry.tokenBalance !== "string" || !/^0x[\da-fA-F]+$/.test(entry.tokenBalance)) continue;
    const raw = BigInt(entry.tokenBalance);
    if (raw > BigInt(0)) balances.set(entry.contractAddress.toLowerCase(), raw);
  }
  return { balances, pageKey: record(result) && typeof result.pageKey === "string" && result.pageKey ? result.pageKey : null };
}

/** A token's name, ticker, decimals and logo, remembered: they don't change. Null when it isn't a readable ERC-20. */
export async function readTokenMeta(rpc: RpcCall, address: string): Promise<TokenMeta | null> {
  const known = meta.get(address);
  if (known && Date.now() - known.at < META_TTL) return known.value;
  const result = await rpc("alchemy_getTokenMetadata", [address]);
  const decimals = record(result) ? numeric(result.decimals) : null;
  const value =
    record(result) && decimals !== null && decimals >= 0 && decimals <= 36
      ? { symbol: cleanSymbol(result.symbol, address), name: cleanName(result.name, address), decimals, art: typeof result.logo === "string" ? (artUrl(result.logo) ?? "") : "" }
      : null;
  if (meta.size >= MAX_META) meta.clear();
  meta.set(address, { value, at: Date.now() });
  return value;
}

function token(address: string, raw: bigint, info: TokenMeta, price: DexPrice | undefined): PortfolioAsset {
  const balance = toAmount(raw, info.decimals);
  const stable = STABLES.has(address);
  // A known stablecoin holds its dollar even where no pool quotes it directly.
  const priceUsd = price?.priceUsd ?? (stable ? 1 : null);
  return {
    chain: "rh",
    address,
    symbol: info.symbol,
    name: info.name,
    art: BASE.find((base) => base.address === address)?.art ?? (price?.art || info.art),
    decimals: info.decimals,
    raw: String(raw),
    balance,
    priceUsd,
    valueUsd: priceUsd === null ? null : balance * priceUsd,
    change: price?.change ?? (stable ? { ...NO_CHANGE, h24: 0 } : NO_CHANGE),
    native: false,
    stable,
    track: address === WETH ? "ETH" : null,
  };
}

/** Every ERC-20 the wallet holds, through the provider's index; a few pages at most. */
async function listBalances(rpc: RpcCall, owner: string): Promise<{ balances: Map<string, bigint>; truncated: boolean }> {
  const balances = new Map<string, bigint>();
  let pageKey: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: unknown = await rpc("alchemy_getTokenBalances", [owner, "erc20", { maxCount: PAGE, ...(pageKey ? { pageKey } : {}) }]);
    const parsed = parseTokenBalances(result);
    for (const [address, raw] of parsed.balances) balances.set(address, raw);
    pageKey = parsed.pageKey;
    if (!pageKey) return { balances, truncated: false };
  }
  return { balances, truncated: true };
}

/** The chain's base tokens by balanceOf, for an RPC with no token index (the public one). */
async function readBaseBalances(rpc: RpcCall, owner: string): Promise<Map<string, bigint>> {
  const padded = owner.slice(2).toLowerCase().padStart(64, "0");
  const balances = new Map<string, bigint>();
  await Promise.all(
    BASE.map(async ({ address }) => {
      const held = await rpc("eth_call", [{ to: address, data: `${BALANCE_OF}${padded}` }, "latest"]);
      if (typeof held === "string" && /^0x[\da-fA-F]+$/.test(held) && BigInt(held) > BigInt(0)) balances.set(address.toLowerCase(), BigInt(held));
    }),
  );
  return balances;
}

/**
 * Everything a Robinhood Chain wallet holds: its ETH, and every ERC-20 the
 * provider has indexed for it, priced from DexScreener. Without the index
 * (the public RPC) only the chain's base tokens are read, and the answer says
 * it is partial. Only the wallet's own ETH is essential.
 */
export async function readRobinhoodPortfolio(owner: string, rpc: RpcCall = jsonRpc(walletRpcUrl("rh"))): Promise<ChainPortfolio> {
  const wei = await rpc("eth_getBalance", [owner, "latest"]);
  if (typeof wei !== "string" || !/^0x[\da-fA-F]+$/.test(wei)) throw new Error("eth_getBalance: bad value");

  let partial = false;
  let held: Map<string, bigint>;
  try {
    const listed = await listBalances(rpc, owner);
    held = listed.balances;
    partial = listed.truncated;
  } catch {
    partial = true;
    held = await readBaseBalances(rpc, owner).catch(() => new Map<string, bigint>());
  }
  const addresses = [...held.keys()];
  const [metas, { prices, failed }] = await Promise.all([
    inChunks(addresses, PARALLEL, async (address) => {
      const base = BASE.find((entry) => entry.address === address);
      return base ? { symbol: base.symbol, name: base.name, decimals: base.decimals, art: base.art } : readTokenMeta(rpc, address);
    }),
    readDexPrices([WETH, ...addresses]),
  ]);
  const eth = prices.get(WETH.toLowerCase());
  // A tonkfun.fun launch still on its curve has no pool for DexScreener to list: its curve prices it.
  const curve = await readCurvePrices(
    addresses.filter((address) => !prices.has(address.toLowerCase()) && !STABLES.has(address)),
    eth?.priceUsd ?? null,
  ).catch(() => new Map<string, DexPrice>());
  const tokens = addresses.flatMap((address, index) => {
    const result = metas[index];
    const raw = held.get(address);
    if (result?.status !== "fulfilled" || !result.value || raw === undefined) {
      if (result?.status === "rejected") partial = true;
      return [];
    }
    return [token(address, raw, result.value, prices.get(address) ?? curve.get(address.toLowerCase()))];
  });
  const raw = BigInt(wei);
  const balance = toAmount(raw, 18);
  const native: PortfolioAsset = {
    chain: "rh",
    address: NATIVE_EVM,
    symbol: "ETH",
    name: "Ether",
    art: "/coins/eth.svg",
    decimals: 18,
    raw: String(raw),
    balance,
    priceUsd: eth?.priceUsd ?? null,
    valueUsd: eth ? balance * eth.priceUsd : null,
    change: eth?.change ?? NO_CHANGE,
    native: true,
    stable: false,
    track: "ETH",
  };
  return { chain: "rh", owner, ...trimUnpriced([...(raw > BigInt(0) ? [native] : []), ...tokens]), partial: partial || failed, readAt: Date.now() };
}
