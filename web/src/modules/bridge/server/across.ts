import { getAddress } from "viem";
import { sameAddress } from "@/shared/lib/address";
import type { BridgeStatus } from "../lib/types";
import { type BridgeConfig, BridgeError, fetchJson, isDigits, isRecord, numberOf } from "./config";
import { assertAcrossEvm, assertSpender } from "./contracts";
import { type ProviderPlan, sourceSeconds } from "./plan";
import type { BridgeRequest } from "./request";

const ORIGIN = "https://app.across.to/api";

const headers = (config: BridgeConfig) => (config.acrossKey ? { authorization: `Bearer ${config.acrossKey}` } : undefined);

function reason(body: unknown): BridgeError {
  const code = isRecord(body) ? body.code : null;
  if (code === "AMOUNT_TOO_LOW") return new BridgeError("too-small", "across: amount too low", 400);
  if (code === "AMOUNT_TOO_HIGH") return new BridgeError("too-large", "across: too large", 400);
  return new BridgeError("no-route", "across: no route");
}

const usdOf = (fees: Record<string, unknown>, name: string) => (isRecord(fees[name]) ? numberOf(fees[name].amountUsd) : null);
/** Skipping the origin estimate reports its gas as zero, which means "not worked out". */
const knownCost = (usd: number | null) => (usd !== null && usd > 0 ? usd : null);

/** One answer of Across's swap API as a plan, refused if it isn't exactly what was asked for. Exported for tests. */
export function parseAcross(body: unknown, request: BridgeRequest): ProviderPlan {
  if (!isRecord(body) || !isRecord(body.swapTx) || !isRecord(body.inputToken) || !isRecord(body.outputToken)) throw new BridgeError("no-route", "across: bad answer");
  const tx = body.swapTx;
  if (Number(body.inputToken.chainId) !== request.from.chainId || Number(body.outputToken.chainId) !== request.to.chainId) throw new BridgeError("no-route", "across: wrong chain");
  if (typeof body.inputToken.address !== "string" || typeof body.outputToken.address !== "string") throw new BridgeError("no-route", "across: bad assets");
  // Across names a chain's coin by its wrapped token, so the coin is only checked by being asked for.
  if (!request.asset.native && !sameAddress(body.inputToken.address, request.asset.address)) throw new BridgeError("no-route", "across: wrong input");
  if (!request.receive.native && !sameAddress(body.outputToken.address, request.receive.address)) throw new BridgeError("no-route", "across: wrong output");
  if (body.inputAmount !== request.amount || !isDigits(body.expectedOutputAmount) || !isDigits(body.minOutputAmount) || BigInt(body.minOutputAmount) > BigInt(body.expectedOutputAmount)) throw new BridgeError("no-route", "across: bad amounts");
  if (typeof tx.to !== "string" || typeof tx.data !== "string" || Number(tx.chainId) !== request.from.chainId) throw new BridgeError("no-route", "across: bad transaction");
  assertAcrossEvm(request.from.chainId, tx.to);
  // The call has to name the recipient the person chose.
  if (!tx.data.toLowerCase().includes(request.recipient.slice(2).toLowerCase())) throw new BridgeError("no-route", "across: wrong recipient");
  const value = tx.value === undefined || tx.value === null ? "0" : String(tx.value);
  if (value !== (request.asset.native ? request.amount : "0")) throw new BridgeError("no-route", "across: wrong value");

  // Its own approval is unlimited; only who to approve is taken from it.
  const allowance = isRecord(body.checks) && isRecord(body.checks.allowance) ? body.checks.allowance : null;
  const spender = !request.asset.native && allowance && typeof allowance.spender === "string" ? allowance.spender : null;
  if (spender) assertSpender("across", request.from.chainId, spender);
  if (!request.asset.native && !spender) throw new BridgeError("no-route", "across: no spender");

  const fees = isRecord(body.fees) ? body.fees : {};
  const gas = isDigits(tx.gas) && tx.gas !== "0" ? tx.gas : null;
  return {
    route: {
      id: "across",
      provider: "across",
      name: "Across",
      outAmount: body.expectedOutputAmount,
      minOut: body.minOutputAmount,
      etaSeconds: (numberOf(body.expectedFillTime) ?? 5) + sourceSeconds(request.from.id),
      inUsd: null,
      outUsd: null,
      feeUsd: usdOf(fees, "total"),
      networkUsd: knownCost(usdOf(fees, "originGas")),
      gasTopUp: null,
      trustless: false,
    },
    tracking: { provider: "across", requestId: null, tool: null },
    spender,
    evm: { chainId: request.from.chainId, to: tx.to, data: tx.data, value, gas },
    solana: null,
  };
}

/** Across's route for the transfer. Its API takes checksummed addresses. */
export async function acrossPlan(request: BridgeRequest, config: BridgeConfig): Promise<ProviderPlan> {
  const params = new URLSearchParams({
    tradeType: "exactInput",
    amount: request.amount,
    inputToken: getAddress(request.asset.address),
    outputToken: getAddress(request.receive.address),
    originChainId: String(request.from.chainId),
    destinationChainId: String(request.to.chainId),
    depositor: getAddress(request.sender),
    recipient: getAddress(request.recipient),
    refundAddress: getAddress(request.sender),
    skipOriginTxEstimation: "true",
    ...(config.acrossIntegrator ? { integratorId: config.acrossIntegrator } : {}),
  });
  const { status, body } = await fetchJson(`${ORIGIN}/swap/approval?${params}`, { headers: headers(config) }, "across");
  if (status === 401 || status >= 500) throw new BridgeError("unavailable", `across: HTTP ${status}`);
  if (status !== 200) throw reason(body);
  return parseAcross(body, request);
}

/** Where Across says a deposit stands; until its indexer has seen it, the answer is "not found". Exported for tests. */
export function parseAcrossStatus(status: number, body: unknown): BridgeStatus {
  if (status !== 200 || !isRecord(body)) return { state: "transit", destinationTx: null };
  const fill = typeof body.fillTxnRef === "string" ? body.fillTxnRef : typeof body.fillTx === "string" ? body.fillTx : null;
  if (body.status === "filled") return { state: "delivered", destinationTx: fill };
  if (body.status === "refunded" || typeof body.depositRefundTxnRef === "string" || typeof body.depositRefundTxHash === "string") return { state: "refunded", destinationTx: null };
  return { state: "transit", destinationTx: null };
}

export async function acrossStatus(chainId: number, tx: string, config: BridgeConfig): Promise<BridgeStatus> {
  const { status, body } = await fetchJson(`${ORIGIN}/deposit/status?${new URLSearchParams({ originChainId: String(chainId), depositTxnRef: tx })}`, { headers: headers(config) }, "across");
  return parseAcrossStatus(status, body);
}
