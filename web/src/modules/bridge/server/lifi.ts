import { getAddress } from "viem";
import { sameAddress } from "@/shared/lib/address";
import type { BridgeStatus } from "../lib/types";
import { type BridgeConfig, BridgeError, fetchJson, isDigits, isRecord, numberOf } from "./config";
import { assertLifiEvm, assertSpender } from "./contracts";
import { type ProviderPlan, sourceSeconds } from "./plan";
import type { BridgeRequest } from "./request";

const ORIGIN = "https://li.quest/v1";
/** Relay and Across are asked directly; this is for everything else LI.FI can reach. */
const DIRECT = ["relaydepository", "relay", "across"];

const headers = (config: BridgeConfig) => (config.lifiKey ? { "x-lifi-api-key": config.lifiKey } : undefined);
const hexToDecimal = (value: unknown): string | null => (typeof value === "string" && /^0x[\da-fA-F]+$/.test(value) ? BigInt(value).toString() : null);
const sumUsd = (list: unknown): number | null => {
  if (!Array.isArray(list)) return null;
  return list.reduce<number>((total, item) => total + (isRecord(item) ? (numberOf(item.amountUSD) ?? 0) : 0), 0);
};

/** LI.FI's best other route as a plan, refused if it isn't exactly what was asked for. Exported for tests. */
export function parseLifi(body: unknown, request: BridgeRequest): ProviderPlan {
  if (!isRecord(body) || !isRecord(body.estimate) || !isRecord(body.action) || !isRecord(body.transactionRequest)) throw new BridgeError("no-route", "lifi: bad answer");
  const { estimate, action, transactionRequest: tx } = body;
  if (!isRecord(action.fromToken) || !isRecord(action.toToken) || typeof action.fromToken.address !== "string" || typeof action.toToken.address !== "string") throw new BridgeError("no-route", "lifi: bad assets");
  if (!sameAddress(action.fromToken.address, request.asset.address) || !sameAddress(action.toToken.address, request.receive.address)) throw new BridgeError("no-route", "lifi: wrong asset");
  if (Number(action.fromChainId) !== request.from.chainId || Number(action.toChainId) !== request.to.chainId) throw new BridgeError("no-route", "lifi: wrong chain");
  if (typeof action.toAddress !== "string" || !sameAddress(action.toAddress, request.recipient)) throw new BridgeError("no-route", "lifi: wrong recipient");
  if (estimate.fromAmount !== request.amount || !isDigits(estimate.toAmount) || !isDigits(estimate.toAmountMin) || BigInt(estimate.toAmountMin) > BigInt(estimate.toAmount)) throw new BridgeError("no-route", "lifi: bad amounts");
  const value = hexToDecimal(tx.value) ?? "0";
  if (typeof tx.to !== "string" || typeof tx.data !== "string" || Number(tx.chainId) !== request.from.chainId) throw new BridgeError("no-route", "lifi: bad transaction");
  assertLifiEvm(request.from.chainId, tx.to);
  if (value !== (request.asset.native ? request.amount : "0")) throw new BridgeError("no-route", "lifi: wrong value");
  const spender = !request.asset.native && typeof estimate.approvalAddress === "string" ? estimate.approvalAddress : null;
  if (spender) assertSpender("lifi", request.from.chainId, spender);
  if (!request.asset.native && !spender) throw new BridgeError("no-route", "lifi: no spender");

  const tool = typeof body.tool === "string" ? body.tool : "lifi";
  const toolName = isRecord(body.toolDetails) && typeof body.toolDetails.name === "string" ? body.toolDetails.name.slice(0, 32) : tool;
  const inUsd = numberOf(estimate.fromAmountUSD);
  const outUsd = numberOf(estimate.toAmountUSD);
  return {
    route: {
      id: "lifi",
      provider: "lifi",
      name: toolName.includes("LI.FI") ? toolName : `${toolName} via LI.FI`,
      outAmount: estimate.toAmount,
      minOut: estimate.toAmountMin,
      etaSeconds: (numberOf(estimate.executionDuration) ?? 30) + sourceSeconds(request.from.id),
      inUsd,
      outUsd,
      feeUsd: sumUsd(estimate.feeCosts),
      networkUsd: sumUsd(estimate.gasCosts),
      gasTopUp: null,
      trustless: false,
    },
    tracking: { provider: "lifi", requestId: null, tool },
    spender,
    evm: { chainId: request.from.chainId, to: tx.to, data: tx.data, value, gas: hexToDecimal(tx.gasLimit) },
    solana: null,
  };
}

export async function lifiPlan(request: BridgeRequest, config: BridgeConfig): Promise<ProviderPlan> {
  const params = new URLSearchParams({
    fromChain: String(request.from.chainId),
    toChain: String(request.to.chainId),
    fromToken: getAddress(request.asset.address),
    toToken: getAddress(request.receive.address),
    fromAddress: getAddress(request.sender),
    toAddress: getAddress(request.recipient),
    fromAmount: request.amount,
    order: "CHEAPEST",
    slippage: String(request.slippageBps / 10_000),
    integrator: "tonkfun",
    skipSimulation: "true",
  });
  for (const bridge of DIRECT) params.append("denyBridges", bridge);
  const { status, body } = await fetchJson(`${ORIGIN}/quote?${params}`, { headers: headers(config) }, "lifi");
  if (status === 401 || status >= 500) throw new BridgeError("unavailable", `lifi: HTTP ${status}`);
  if (status !== 200) throw new BridgeError("no-route", "lifi: no route");
  return parseLifi(body, request);
}

/** Where LI.FI says a transfer stands. "Not found" proves nothing, so it stays in transit. Exported for tests. */
export function parseLifiStatus(status: number, body: unknown): BridgeStatus {
  if (status !== 200 || !isRecord(body)) return { state: "transit", destinationTx: null };
  const receiving = isRecord(body.receiving) && typeof body.receiving.txHash === "string" ? body.receiving.txHash : null;
  if (body.status === "DONE") return body.substatus === "REFUNDED" ? { state: "refunded", destinationTx: receiving } : { state: "delivered", destinationTx: receiving };
  if (body.status === "FAILED") return { state: "failed", destinationTx: null };
  return { state: "transit", destinationTx: null };
}

export async function lifiStatus(input: { tx: string; tool: string | null; fromChain: number; toChain: number }, config: BridgeConfig): Promise<BridgeStatus> {
  const params = new URLSearchParams({ txHash: input.tx, fromChain: String(input.fromChain), toChain: String(input.toChain), ...(input.tool ? { bridge: input.tool } : {}) });
  const { status, body } = await fetchJson(`${ORIGIN}/status?${params}`, { headers: headers(config) }, "lifi");
  return parseLifiStatus(status, body);
}
