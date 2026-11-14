/** Robinhood Chain mainnet: the only chain the cap is sent on. */
const ROBINHOOD_MAINNET = 4663;

/**
 * True on Robinhood Chain mainnet, where the cap guards wallets that price at
 * eth_gasPrice. On the testnet both the base fee and eth_gasPrice sit at the
 * floor, so the cap isn't needed there, and MetaMask (which prices the
 * testnet at eth_gasPrice) would flag it as a "High site fee".
 */
export function wantsFeeCap(chainId: number): boolean {
  return chainId === ROBINHOOD_MAINNET;
}

/** A read through the wallet's own provider. */
export type ChainRead = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

/** The fee fields of an EIP-1559 transaction, as hex quantities. */
export interface FeeCap {
  maxFeePerGas: `0x${string}`;
  maxPriorityFeePerGas: `0x${string}`;
}

/**
 * The fee cap a Robinhood Chain transaction goes out with. The chain suggests
 * (eth_gasPrice) its floor of 0.02 gwei while its base fee often sits just
 * above it, so a wallet that prices at the suggestion warns "likely to fail"
 * and the network refuses the transaction ("max fee per gas less than block
 * base fee"). A cap of twice the latest base fee keeps it in through any
 * ordinary move; the chain only ever charges the base fee, and takes no tip,
 * so the cap costs nothing. Null when the block can't be read in time: the
 * wallet then prices the transaction itself, as before.
 */
export async function chainFeeCap(read: ChainRead, timeoutMs = 3_000): Promise<FeeCap | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const block = await Promise.race([read({ method: "eth_getBlockByNumber", params: ["latest", false] }), late]);
    const base = typeof block === "object" && block !== null ? (block as { baseFeePerGas?: unknown }).baseFeePerGas : undefined;
    if (typeof base !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(base)) return null;
    const cap = BigInt(base) * BigInt(2);
    return cap > BigInt(0) ? { maxFeePerGas: `0x${cap.toString(16)}`, maxPriorityFeePerGas: "0x0" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
