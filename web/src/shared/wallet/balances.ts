import { isChainId } from "@/shared/config/chains";
import { isChainAddress, sameAddress } from "@/shared/lib/address";
import type { ChainId } from "@/shared/types/chain";
import { isRawAmount, type RawAmount } from "./units";

/** What /api/wallet/[chain]/[owner] returns: a wallet's coin and, when asked, one token. */
export interface WalletBalances {
  chain: ChainId;
  owner: string;
  /** SOL or ETH. */
  native: RawAmount;
  /** The token asked for (`?token=`), or null when none was. A wallet without it holds "0". */
  token: { address: string; amount: RawAmount } | null;
  /** ms */
  readAt: number;
}

/** The app's own route for a wallet's balances. Only addresses in the chain's format are accepted. */
export function balancesPath(chain: ChainId, owner: string, token: string | null): string {
  const path = `/api/wallet/${chain}/${encodeURIComponent(owner)}`;
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rejects a malformed response, or one for another wallet, chain or token. */
export function isWalletBalances(value: unknown, chain: ChainId, owner: string, token: string | null): value is WalletBalances {
  if (!record(value) || !isChainId(value.chain as string) || value.chain !== chain) return false;
  if (typeof value.owner !== "string" || !isChainAddress(chain, value.owner) || !sameAddress(value.owner, owner)) return false;
  if (!isRawAmount(value.native) || typeof value.readAt !== "number" || !Number.isFinite(value.readAt)) return false;
  if (token === null) return value.token === null;
  const held = value.token;
  return record(held) && typeof held.address === "string" && sameAddress(held.address, token) && isRawAmount(held.amount);
}
