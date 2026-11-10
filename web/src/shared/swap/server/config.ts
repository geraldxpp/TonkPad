import { isTestnetSite } from "@/shared/tonk/networks";
import { isEvmAddress, isSolanaAddress } from "@/shared/lib/address";

/** tonkfun.fun's fee on every swap: 1% (100 basis points), the owner's call (10 Nov 2026). */
export const FEE_BPS = 100;

/** A valid wallet that belongs to no one, standing in as the taker for quotes made before a wallet connects. */
const QUOTE_TAKER_SOL = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";

export interface SwapConfig {
  jupiterKey: string | null;
  zeroExKey: string | null;
  /** Where fees go; a malformed address counts as unset (no fee is taken rather than a lost one). */
  solanaFeeWallet: string | null;
  evmFeeWallet: string | null;
  feeBps: number;
  /** The go-live switch: SWAP_TRADING=on lets the server build real transactions. Quotes work either way. */
  tradingOpen: boolean;
  quoteTakerSol: string;
}

const value = (raw: string | undefined) => (raw && raw.trim() ? raw.trim() : null);

/**
 * The swap's server settings, from env vars that never reach the browser
 * (none are NEXT_PUBLIC_): JUPITER_API_KEY, ZEROX_API_KEY, SOLANA_FEE_WALLET,
 * EVM_FEE_WALLET and SWAP_TRADING.
 */
export function swapConfig(env: Readonly<Record<string, string | undefined>> = process.env): SwapConfig {
  const solFee = value(env.SOLANA_FEE_WALLET);
  const evmFee = value(env.EVM_FEE_WALLET);
  return {
    jupiterKey: value(env.JUPITER_API_KEY),
    zeroExKey: value(env.ZEROX_API_KEY),
    solanaFeeWallet: solFee && isSolanaAddress(solFee) ? solFee : null,
    evmFeeWallet: evmFee && isEvmAddress(evmFee) ? evmFee : null,
    feeBps: FEE_BPS,
    // Never on the testnet site: Jupiter and 0x only cover mainnet.
    tradingOpen: value(env.SWAP_TRADING) === "on" && !isTestnetSite(),
    quoteTakerSol: QUOTE_TAKER_SOL,
  };
}

/** A failure the route can explain: what went wrong, in a code the browser maps to a message. */
export class SwapError extends Error {
  constructor(
    readonly code: "no-route" | "unavailable" | "busy" | "closed" | "invalid" | "expired" | "rejected",
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "SwapError";
  }
}

/** GET a JSON API with a timeout. 429s become "busy"; other failures "unavailable". Keys never appear in errors. */
export async function getJson(url: string, headers: Record<string, string>, label: string): Promise<unknown> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new SwapError("busy", `${label}: rate limited`, 503);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new SwapError(res.status === 400 || res.status === 404 ? "no-route" : "unavailable", `${label}: HTTP ${res.status}`);
  return body;
}

export const isRecord = (input: unknown): input is Record<string, unknown> => typeof input === "object" && input !== null;
export const digitString = (input: unknown): input is string => typeof input === "string" && /^\d+$/.test(input);
