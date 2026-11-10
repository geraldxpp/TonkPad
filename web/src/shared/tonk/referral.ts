import { isEvmAddress } from "@/shared/lib/address";

/** Where the referrer a visitor arrived through is remembered on this device, per network. */
export const referralKey = (chainId: number) => `tonkpad-ref:${chainId}`;

/** A referral link for a wallet: the site's home with `?ref=<address>`. */
export function referralLink(origin: string, homePath: string, address: string): string {
  return `${origin}${homePath}${homePath.includes("?") ? "&" : "?"}ref=${address}`;
}

/**
 * Remembers the first valid referrer a visitor arrives with (later links
 * don't replace it). Curve trades credit it once trading opens on the site;
 * the contract itself ignores a trader's own address.
 */
export function rememberReferrer(storage: Pick<Storage, "getItem" | "setItem">, chainId: number, ref: string | null): void {
  if (!ref || !isEvmAddress(ref)) return;
  try {
    if (!storage.getItem(referralKey(chainId))) storage.setItem(referralKey(chainId), ref);
  } catch {
    // Blocked storage: the visit simply carries no referrer.
  }
}

/** The referrer to name on a trade: the remembered one, unless it is the trader's own address (the contract ignores that too). */
export function storedReferrer(storage: Pick<Storage, "getItem">, chainId: number, trader: string): string | null {
  try {
    const ref = storage.getItem(referralKey(chainId));
    return ref && isEvmAddress(ref) && ref.toLowerCase() !== trader.toLowerCase() ? ref : null;
  } catch {
    return null;
  }
}
