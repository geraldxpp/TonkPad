import { NATIVE_EVM, USDG, WETH } from "../tokens";
import { digitString, getJson, isRecord, SwapError } from "./config";

const BASE = "https://api.0x.org/swap/allowance-holder";
const CHAIN_ID = "4663";

export interface ZeroExRequest {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippageBps: number;
  /** Needed for a firm quote with a transaction; a price needs none. */
  taker: string | null;
  fee: { recipient: string; bps: number; token: string } | null;
}

export interface ZeroExResult {
  buyAmount: string;
  minBuyAmount: string;
  integratorFee: { amount: string; token: string } | null;
  /** Wei, when 0x estimates it. */
  networkFee: string | null;
  sources: string[];
  /** Set when the taker's allowance for the AllowanceHolder contract is short (ERC-20 sells only). */
  allowance: { spender: string; actual: string } | null;
  transaction: { to: string; data: string; value: string; gas: string | null } | null;
}

/** Which side 0x takes the fee in: the ETH side when there is one, else WETH or USDG, else what's bought. */
export function evmFeeToken(sellToken: string, buyToken: string): string {
  const lower = [sellToken.toLowerCase(), buyToken.toLowerCase()];
  for (const preferred of [NATIVE_EVM, WETH, USDG]) {
    const index = lower.indexOf(preferred.toLowerCase());
    if (index >= 0) return index === 0 ? sellToken : buyToken;
  }
  return buyToken;
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * A Robinhood Chain swap through 0x (AllowanceHolder flow): "price" for an
 * indicative quote, "quote" for a firm one with the transaction to send.
 */
export async function zeroEx(kind: "price" | "quote", request: ZeroExRequest, key: string | null): Promise<ZeroExResult> {
  if (!key) throw new SwapError("unavailable", "0x: no API key");
  const params = new URLSearchParams({
    chainId: CHAIN_ID,
    sellToken: request.sellToken,
    buyToken: request.buyToken,
    sellAmount: request.sellAmount,
    slippageBps: String(request.slippageBps),
  });
  if (request.taker) params.set("taker", request.taker);
  if (request.fee) {
    params.set("swapFeeRecipient", request.fee.recipient);
    params.set("swapFeeBps", String(request.fee.bps));
    params.set("swapFeeToken", request.fee.token);
  }
  const body = await getJson(`${BASE}/${kind}?${params}`, { "0x-api-key": key, "0x-version": "v2" }, `0x ${kind}`);
  if (!isRecord(body) || body.liquidityAvailable === false) throw new SwapError("no-route", "0x: no liquidity");
  if (!digitString(body.buyAmount) || !digitString(body.minBuyAmount)) throw new SwapError("unavailable", "0x: bad response");
  const fees = isRecord(body.fees) ? body.fees : {};
  const integrator = isRecord(fees.integratorFee) ? fees.integratorFee : null;
  const route = isRecord(body.route) && Array.isArray(body.route.fills) ? body.route.fills : [];
  const sources = route
    .map((fill) => (isRecord(fill) ? text(fill.source) : null))
    .filter((source): source is string => source !== null)
    .map((source) => source.replace(/_/g, " "));
  const issues = isRecord(body.issues) ? body.issues : {};
  const allowance = isRecord(issues.allowance) ? issues.allowance : null;
  const tx = isRecord(body.transaction) ? body.transaction : null;
  return {
    buyAmount: body.buyAmount,
    minBuyAmount: body.minBuyAmount,
    integratorFee: integrator && digitString(integrator.amount) && text(integrator.token) ? { amount: integrator.amount, token: String(integrator.token) } : null,
    networkFee: digitString(body.totalNetworkFee) ? body.totalNetworkFee : null,
    sources: [...new Set(sources)],
    allowance: allowance && text(allowance.spender) && digitString(allowance.actual) ? { spender: String(allowance.spender), actual: allowance.actual } : null,
    transaction:
      tx && text(tx.to) && text(tx.data) && digitString(tx.value)
        ? { to: String(tx.to), data: String(tx.data), value: tx.value, gas: digitString(tx.gas) ? tx.gas : null }
        : null,
  };
}

/** ETH's USD price on Robinhood Chain: what one WETH sells for in USDG. */
export async function ethUsd(key: string | null): Promise<number | null> {
  const result = await zeroEx("price", { sellToken: WETH, buyToken: USDG, sellAmount: "1000000000000000000", slippageBps: 100, taker: null, fee: null }, key);
  const usd = Number(result.buyAmount) / 1e6;
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}
