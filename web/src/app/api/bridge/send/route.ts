import { bridgeConfig, BridgeError } from "@/modules/bridge/server/config";
import { bodyRecord, errorResponse, jsonResponse, refuseOnTestnet } from "@/modules/bridge/server/request";
import { overLimit } from "@/shared/lib/rate-limit";
import { sendSolanaTransaction } from "@/shared/swap/server/send";

/** A signed Solana transaction is at most 1,232 bytes: 1,644 base64 characters. */
const BASE64_TX = /^[A-Za-z0-9+/]{100,1644}={0,2}$/;

/** Sends a wallet-signed Solana deposit through the server's RPC: POST /api/bridge/send { transaction }. */
export async function POST(request: Request) {
  const limited = overLimit(request, "bridgeSend");
  if (limited) return limited;
  try {
    refuseOnTestnet();
    if (!bridgeConfig().tradingOpen) throw new BridgeError("closed", "transfers are not open yet", 403);
    const { transaction } = await bodyRecord(request);
    if (typeof transaction !== "string" || !BASE64_TX.test(transaction)) throw new BridgeError("invalid", "bad transaction", 400);
    const signature = await sendSolanaTransaction(transaction).catch(() => {
      // The RPC refuses at preflight when it would fail now (funds short, the blockhash gone).
      throw new BridgeError("expired", "solana: send failed", 409);
    });
    return jsonResponse({ signature });
  } catch (error) {
    return errorResponse(error);
  }
}
