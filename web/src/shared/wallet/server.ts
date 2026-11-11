import { isTestnetSite, TONK_TESTNET } from "@/shared/tonk/networks";
import { tonkRpcUrl } from "@/shared/tonk/server/client";
import type { ChainId } from "@/shared/types/chain";
import type { WalletBalances } from "./balances";
import { jsonRpc, readEvmBalances, readSolanaBalances } from "./rpc";

/** Public endpoints, used when the server has no provider keys. Solana's refuses browser requests, so it is only called from here. */
export const PUBLIC_RPC: Record<ChainId, string> = {
  sol: "https://api.mainnet-beta.solana.com",
  rh: "https://rpc.mainnet.chain.robinhood.com",
};

const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

/**
 * The RPC each chain's balances are read from, on the server only:
 * SOLANA_RPC_URL, else Helius with HELIUS_API_KEY, else the public RPC;
 * ROBINHOOD_RPC_URL, else the public RPC. None of these is NEXT_PUBLIC_, so
 * Next never puts them in a browser bundle.
 */
export function walletRpcUrl(chain: ChainId, env: Readonly<Record<string, string | undefined>> = process.env): string {
  // The testnet site reads Robinhood Chain Testnet: the mainnet RPC would report mainnet balances for the same address.
  if (chain === "rh" && isTestnetSite()) return tonkRpcUrl(TONK_TESTNET, env);
  if (chain === "rh") return value(env.ROBINHOOD_RPC_URL) ?? PUBLIC_RPC.rh;
  const custom = value(env.SOLANA_RPC_URL);
  if (custom) return custom;
  const helius = value(env.HELIUS_API_KEY);
  return helius ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}` : PUBLIC_RPC.sol;
}

/** Reads a wallet's coin and (optionally) one token. The addresses must already be validated. */
export async function readWalletBalances(chain: ChainId, owner: string, token: string | null): Promise<WalletBalances> {
  const rpc = jsonRpc(walletRpcUrl(chain));
  const read = chain === "sol" ? readSolanaBalances : readEvmBalances;
  const balances = await read(rpc, owner, token);
  return {
    chain,
    owner,
    native: balances.native,
    token: token && balances.token ? { address: token, amount: balances.token } : null,
    readAt: Date.now(),
  };
}
