import type { ChainId } from "@/shared/types/chain";
import type { SwapTxState } from "@/shared/types/swap";
import { jsonRpc } from "@/shared/wallet/rpc";
import { walletRpcUrl } from "@/shared/wallet/server";
import { isRecord, SwapError } from "./config";

/** A Solana signature: 64 bytes in base58 (87–88 characters). EVM hashes are 0x + 32 bytes. */
export function isTxId(chain: ChainId, tx: string): boolean {
  return chain === "sol" ? /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(tx) : /^0x[\da-fA-F]{64}$/.test(tx);
}

/**
 * Sends a wallet-signed Solana transaction through the server's RPC (whose
 * key stays here), with a preflight check so a doomed swap fails before it
 * costs a fee. Resolves with the signature.
 */
export async function sendSolanaTransaction(signedBase64: string): Promise<string> {
  const rpc = jsonRpc(walletRpcUrl("sol"));
  try {
    const signature = await rpc("sendTransaction", [
      signedBase64,
      { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 },
    ]);
    if (typeof signature !== "string") throw new Error("no signature");
    return signature;
  } catch {
    // The RPC rejects at preflight when the swap would fail now (price moved past slippage, funds short).
    throw new SwapError("expired", "solana: send failed", 409);
  }
}

/** Where a transaction stands: Solana signature status, or the EVM receipt. */
export async function transactionState(chain: ChainId, tx: string): Promise<SwapTxState> {
  const rpc = jsonRpc(walletRpcUrl(chain));
  if (chain === "sol") {
    const result = await rpc("getSignatureStatuses", [[tx], { searchTransactionHistory: false }]);
    const entry = isRecord(result) && Array.isArray(result.value) ? result.value[0] : null;
    if (!isRecord(entry)) return "pending";
    if (entry.err) return "failed";
    return entry.confirmationStatus === "confirmed" || entry.confirmationStatus === "finalized" ? "confirmed" : "pending";
  }
  const receipt = await rpc("eth_getTransactionReceipt", [tx]);
  if (!isRecord(receipt)) return "pending";
  return receipt.status === "0x1" ? "confirmed" : "failed";
}
