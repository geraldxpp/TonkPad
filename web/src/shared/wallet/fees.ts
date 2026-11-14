/** Robinhood Chain mainnet: where the site's transactions go out in the legacy format. */
const ROBINHOOD_MAINNET = 4663;

/**
 * True on Robinhood Chain mainnet. There MetaMask's Smart Transactions
 * test-run each transaction on MetaMask's own simulator and cancel what it
 * predicts will fail. That simulator answers the chain's ArbSys block lookup
 * with random data, so every launch and curve buy (the Block-0 Shield reads
 * it) looked doomed there and was cancelled, though the chain accepts them.
 * MetaMask sends a legacy (type 0x0) transaction the ordinary way, as with
 * Smart Transactions off, so the site sends that format on this chain. The
 * testnet doesn't need it: MetaMask runs no Smart Transactions there.
 */
export function sendsLegacy(chainId: number): boolean {
  return chainId === ROBINHOOD_MAINNET;
}

/** A read through the wallet's own provider. */
export type ChainRead = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

/** The fee fields of a legacy transaction, as hex quantities. */
export interface LegacyFees {
  type: "0x0";
  gasPrice?: `0x${string}`;
}

/**
 * The fee fields a Robinhood Chain mainnet transaction goes out with: the
 * legacy format, priced at twice the latest base fee. The type is explicit,
 * because MetaMask turns a bare gasPrice into an EIP-1559 transaction, which
 * goes to Smart Transactions. The chain suggests (eth_gasPrice) its floor of
 * 0.02 gwei while its base fee often sits just above it, and a wallet pricing
 * at the suggestion is refused; twice the base fee keeps it in through any
 * ordinary move. The chain only ever charges the base fee, so the margin
 * costs nothing. When the block can't be read in time it is still legacy,
 * and the wallet sets the price.
 */
export async function chainFees(read: ChainRead, timeoutMs = 3_000): Promise<LegacyFees> {
  const base = await latestBaseFee(read, timeoutMs);
  return base === null ? { type: "0x0" } : { type: "0x0", gasPrice: `0x${(base * BigInt(2)).toString(16)}` };
}

/** The latest block's base fee, or null when it can't be read in time or makes no sense. */
async function latestBaseFee(read: ChainRead, timeoutMs: number): Promise<bigint | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const block = await Promise.race([read({ method: "eth_getBlockByNumber", params: ["latest", false] }), late]);
    const base = typeof block === "object" && block !== null ? (block as { baseFeePerGas?: unknown }).baseFeePerGas : undefined;
    if (typeof base !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(base)) return null;
    const fee = BigInt(base);
    return fee > BigInt(0) ? fee : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A site transaction as the wallet driver gets it: amounts in wei, as decimal strings. */
export interface EvmSend {
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

const hexWei = (wei: string) => `0x${BigInt(wei).toString(16)}`;

/**
 * The exact eth_sendTransaction params for a transaction on `chainId`, so the
 * fix lives in one tested place: on Robinhood Chain mainnet the legacy fee
 * fields (never maxFeePerGas or maxPriorityFeePerGas), elsewhere none, and
 * the wallet prices it. `read` is only asked on Robinhood Chain mainnet.
 */
export async function evmSendParams(tx: EvmSend, chainId: number, read: ChainRead): Promise<Record<string, string>> {
  const fees = sendsLegacy(chainId) ? await chainFees(read) : null;
  return { from: tx.from, to: tx.to, data: tx.data, value: hexWei(tx.value), ...(tx.gas ? { gas: hexWei(tx.gas) } : {}), ...(fees ?? {}) };
}
