import { sameAddress } from "@/shared/lib/address";
import type { BridgeStatus } from "../lib/types";
import { type BridgeConfig, BridgeError, fetchJson, isDigits, isRecord, numberOf } from "./config";
import { assertRelayEvm, assertRelaySolana, assertSpender } from "./contracts";
import { APPROVE_SELECTOR, type ProviderPlan, type SolanaInstructions, sourceSeconds } from "./plan";
import type { BridgeRequest } from "./request";

const ORIGIN = "https://api.relay.link";
/** A dollar of gas, plenty for the next few transactions. Relay counts in millionths of a dollar. */
const TOP_UP = "1000000";

const headers = (config: BridgeConfig) => ({ "content-type": "application/json", ...(config.relayKey ? { "x-api-key": config.relayKey } : {}) });

function reason(body: unknown): BridgeError {
  const code = isRecord(body) ? body.errorCode : null;
  if (code === "AMOUNT_TOO_LOW") return new BridgeError("too-small", "relay: amount too low", 400);
  if (code === "INSUFFICIENT_LIQUIDITY" || code === "SWAP_IMPACT_TOO_HIGH") return new BridgeError("too-large", "relay: too large", 400);
  return new BridgeError("no-route", "relay: no route");
}

function side(value: unknown, chainId: number, address: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.currency) || Number(value.currency.chainId) !== chainId) throw new BridgeError("no-route", "relay: wrong chain");
  if (typeof value.currency.address !== "string" || !sameAddress(value.currency.address, address)) throw new BridgeError("no-route", "relay: wrong asset");
  return value;
}

const isSolanaData = (data: Record<string, unknown>): data is Record<string, unknown> & SolanaInstructions => Array.isArray(data.instructions) && Array.isArray(data.addressLookupTableAddresses);

/** One answer of Relay's quote as a plan, refused if it isn't exactly what was asked for. Exported for tests. */
export function parseRelay(body: unknown, request: BridgeRequest): ProviderPlan {
  if (!isRecord(body) || !Array.isArray(body.steps) || !isRecord(body.details)) throw new BridgeError("no-route", "relay: bad answer");
  const { details } = body;
  if (typeof details.recipient !== "string" || !sameAddress(details.recipient, request.recipient)) throw new BridgeError("no-route", "relay: wrong recipient");
  const sent = side(details.currencyIn, request.from.chainId, request.asset.address);
  const got = side(details.currencyOut, request.to.chainId, request.receive.address);
  if (sent.amount !== request.amount || !isDigits(got.amount) || !isDigits(got.minimumAmount) || BigInt(got.minimumAmount) > BigInt(got.amount)) throw new BridgeError("no-route", "relay: bad amounts");

  const steps = body.steps.filter((step) => isRecord(step) && Array.isArray(step.items) && step.items.length > 0) as Record<string, unknown>[];
  // A signature step would need a flow this screen doesn't run.
  if (steps.some((step) => step.kind !== "transaction" || (step.items as unknown[]).length !== 1)) throw new BridgeError("no-route", "relay: unsupported step");
  const approve = steps.find((step) => step.id === "approve" || step.id === "approval");
  const main = steps.filter((step) => step !== approve);
  if (main.length !== 1) throw new BridgeError("no-route", "relay: unexpected steps");
  const item = (main[0].items as unknown[])[0];
  const data = isRecord(item) && isRecord(item.data) ? item.data : null;
  if (!data) throw new BridgeError("no-route", "relay: no transaction");

  let spender: string | null = null;
  if (approve) {
    const approveItem = (approve.items as unknown[])[0];
    const call = isRecord(approveItem) && isRecord(approveItem.data) ? approveItem.data.data : null;
    if (typeof call !== "string" || !call.startsWith(APPROVE_SELECTOR)) throw new BridgeError("no-route", "relay: bad approval");
    spender = `0x${call.slice(34, 74)}`;
    assertSpender("relay", request.from.chainId, spender);
  }
  const requestId = typeof body.requestId === "string" ? body.requestId : typeof main[0].requestId === "string" ? main[0].requestId : null;
  if (!requestId) throw new BridgeError("no-route", "relay: no request id");

  const fees = isRecord(body.fees) ? body.fees : {};
  const gas = isRecord(fees.gas) ? numberOf(fees.gas.amountUsd) : null;
  const topUp = isRecord(details.currencyGasTopup) && isDigits(details.currencyGasTopup.amount) ? { raw: details.currencyGasTopup.amount, usd: numberOf(details.currencyGasTopup.amountUsd) } : null;
  const inUsd = numberOf(sent.amountUsd);
  const outUsd = numberOf(got.amountUsd);
  const route = {
    id: "relay",
    provider: "relay" as const,
    name: "Relay",
    outAmount: got.amount,
    minOut: got.minimumAmount,
    etaSeconds: (numberOf(details.timeEstimate) ?? 5) + sourceSeconds(request.from.id),
    inUsd,
    outUsd,
    feeUsd: inUsd !== null && outUsd !== null ? Math.max(0, inUsd - outUsd - (topUp?.usd ?? 0)) : null,
    networkUsd: gas,
    gasTopUp: topUp,
    trustless: false,
  };
  const tracking = { provider: "relay" as const, requestId, tool: null };
  if (request.from.vm === "svm") {
    if (!isSolanaData(data)) throw new BridgeError("no-route", "relay: not a Solana transaction");
    assertRelaySolana(data, request.sender);
    return { route, tracking, spender: null, evm: null, solana: { instructions: data.instructions, addressLookupTableAddresses: data.addressLookupTableAddresses } };
  }
  if (typeof data.to !== "string" || typeof data.data !== "string" || !isDigits(data.value) || Number(data.chainId) !== request.from.chainId) throw new BridgeError("no-route", "relay: bad transaction");
  assertRelayEvm(request.from.chainId, data.to);
  if (data.value !== (request.asset.native ? request.amount : "0")) throw new BridgeError("no-route", "relay: wrong value");
  const gasLimit = isDigits(data.gas) && data.gas !== "0" ? data.gas : null;
  return { route, tracking, spender, evm: { chainId: request.from.chainId, to: data.to, data: data.data, value: data.value, gas: gasLimit }, solana: null };
}

/** Relay's route for the transfer: a quote and the transaction together. */
export async function relayPlan(request: BridgeRequest, config: BridgeConfig): Promise<ProviderPlan> {
  const { status, body } = await fetchJson(
    `${ORIGIN}/quote/v2`,
    {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        user: request.sender,
        recipient: request.recipient,
        refundTo: request.sender,
        originChainId: request.from.chainId,
        destinationChainId: request.to.chainId,
        originCurrency: request.asset.address,
        destinationCurrency: request.receive.address,
        amount: request.amount,
        tradeType: "EXACT_INPUT",
        slippageTolerance: String(request.slippageBps),
        ...(request.gasTopUp ? { topupGas: true, topupGasAmount: TOP_UP } : {}),
      }),
    },
    "relay",
  );
  if (status === 401 || status >= 500) throw new BridgeError("unavailable", `relay: HTTP ${status}`);
  if (status !== 200) throw reason(body);
  return parseRelay(body, request);
}

/** Where Relay says a request stands. A failure isn't final until Relay says the refund failed. Exported for tests. */
export function parseRelayStatus(body: unknown): BridgeStatus {
  if (!isRecord(body)) return { state: "transit", destinationTx: null };
  const hashes = Array.isArray(body.txHashes) ? body.txHashes.filter((hash): hash is string => typeof hash === "string") : [];
  if (body.status === "success" && hashes.length > 0) return { state: "delivered", destinationTx: hashes[hashes.length - 1] };
  if (body.status === "refund") return { state: "refunded", destinationTx: hashes[hashes.length - 1] ?? null };
  if (body.status === "failure" && typeof body.refundFailReason === "string" && body.refundFailReason) return { state: "failed", destinationTx: null };
  return { state: "transit", destinationTx: null };
}

export async function relayStatus(requestId: string, config: BridgeConfig): Promise<BridgeStatus> {
  const { status, body } = await fetchJson(`${ORIGIN}/intents/status/v3?${new URLSearchParams({ requestId })}`, { headers: headers(config) }, "relay");
  return status === 200 ? parseRelayStatus(body) : { state: "transit", destinationTx: null };
}
