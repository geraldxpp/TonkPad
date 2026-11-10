import { overLimit } from "@/shared/lib/rate-limit";
import { swapConfig, SwapError } from "@/shared/swap/server/config";
import { bodyRecord, errorResponse, jsonResponse, refuseOnTestnet } from "@/shared/swap/server/request";
import { sendSolanaTransaction } from "@/shared/swap/server/send";

/** A signed Solana transaction is at most 1,232 bytes: 1,644 base64 characters. */
const BASE64_TX = /^[A-Za-z0-9+/]{100,1644}={0,2}$/;

/** Sends a wallet-signed Solana swap through the server's RPC: POST /api/swap/send { transaction }. */
export async function POST(request: Request) {
  const limited = overLimit(request, "send");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    if (!swapConfig().tradingOpen) throw new SwapError("closed", "trading is not open yet", 403);
    const { transaction } = await bodyRecord(request);
    if (typeof transaction !== "string" || !BASE64_TX.test(transaction)) throw new SwapError("invalid", "bad transaction", 400);
    return jsonResponse({ signature: await sendSolanaTransaction(transaction) });
  } catch (error) {
    return errorResponse(error);
  }
}
