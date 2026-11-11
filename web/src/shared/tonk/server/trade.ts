import { encodeFunctionData, parseEventLogs, type PublicClient } from "viem";
import type { TradeBuild, TradeRequest } from "../mission";
import type { TonkNetwork } from "../networks";
import { quoteTrade } from "../quote";
import { isTxHash } from "../types";
import { LAUNCHPAD_ABI, TOKEN_ABI } from "./abi";
import { address, invalid, isRecord, padGas, refusal, requireFunds, unsigned, wei, ZERO_ADDRESS } from "./build";
import { TonkError, tonkClient } from "./client";
import { readMissionAt } from "./mission";

/** How long a build waits for the chain to reach a just-confirmed approval's block. */
const CATCH_UP_TRIES = 5;
const CATCH_UP_MS = 1_000;
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/** A trade request checked field by field. */
export function parseTradeRequest(body: unknown): TradeRequest {
  if (!isRecord(body)) throw invalid("not an object");
  if (body.side !== "buy" && body.side !== "sell") throw invalid("side");
  const referrer = body.referrer === null || body.referrer === undefined ? null : address(body.referrer, "referrer");
  if (body.approval !== undefined && body.approval !== null && (typeof body.approval !== "string" || !isTxHash(body.approval))) throw invalid("approval");
  const approval = typeof body.approval === "string" ? body.approval : null;
  return { token: address(body.token, "token"), trader: address(body.trader, "trader"), side: body.side, amount: String(wei(body.amount, "amount")), minOut: String(wei(body.minOut, "minimum")), referrer, approval };
}

/**
 * The block of the approval a sale waited for. Its receipt must be a success
 * from the trader on this token, approving the launchpad for at least the
 * amount sold; anything else isn't that approval.
 */
async function approvalBlock(client: PublicClient, network: TonkNetwork, request: TradeRequest, hash: `0x${string}`): Promise<bigint> {
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt || receipt.status !== "success" || !same(receipt.from, request.trader) || !receipt.to || !same(receipt.to, request.token)) throw new TonkError("unavailable", "approval not confirmed");
  const approved = parseEventLogs({ abi: TOKEN_ABI, eventName: "Approval", logs: receipt.logs }).some(
    (log) => same(log.address, request.token) && same(log.args.owner, request.trader) && same(log.args.spender, network.launchpad) && log.args.value >= BigInt(request.amount),
  );
  if (!approved) throw new TonkError("unavailable", "not this sale's approval");
  return receipt.blockNumber;
}

/** The chain's head, never cached; after an approval, no earlier than its block (an RPC replica can lag a moment). */
async function headAtLeast(client: PublicClient, floor: bigint | null): Promise<bigint> {
  for (let attempt = 0; ; attempt += 1) {
    const head = await client.getBlockNumber({ cacheTime: 0 }).catch(() => {
      throw new TonkError("unavailable", "block unreadable");
    });
    if (floor === null || head >= floor) return head;
    if (attempt >= CATCH_UP_TRIES) throw new TonkError("unavailable", "the chain hasn't reached the approval yet");
    await new Promise((resolve) => setTimeout(resolve, CATCH_UP_MS));
  }
}

/**
 * Builds a curve trade for the trader's wallet. The mission is read at one
 * block and the exact call simulated at that same block, so the contract's
 * answer must equal the mirrored quote; if it doesn't, nothing is built.
 * A quote that has fallen under the minimum the trader approved comes back
 * as "moved" with the fresh state. A sell the launchpad may not yet take
 * comes back as an approval for exactly that amount; once that approval is
 * confirmed, the sale is read and built no earlier than its block. Nothing
 * is sent here.
 */
export async function buildTrade(network: TonkNetwork, request: TradeRequest): Promise<TradeBuild> {
  const client = await tonkClient(network);
  const token = request.token as `0x${string}`;
  const trader = request.trader as `0x${string}`;
  const floor = request.approval ? await approvalBlock(client, network, request, request.approval as `0x${string}`) : null;
  const blockNumber = await headAtLeast(client, floor);
  const mission = await readMissionAt(client, network, token, blockNumber);
  if (mission.graduated) throw new TonkError("graduated", "curve trading is over", 409);
  if (mission.paused) throw new TonkError("paused", "trading is paused", 409);

  const amount = BigInt(request.amount);
  const minOut = BigInt(request.minOut);
  // The contract ignores a trader's own address; so does the app.
  const referrer = request.referrer && request.referrer.toLowerCase() !== trader.toLowerCase() ? (request.referrer as `0x${string}`) : ZERO_ADDRESS;
  const pad = { address: network.launchpad, abi: LAUNCHPAD_ABI, account: trader } as const;

  if (request.side === "buy") {
    // Ordinary buys in the launch block and the next lose 99% to the launch-block shield.
    if (!mission.buyingOpen) throw new TonkError("early", "inside the launch-block shield", 409);
    const quote = quoteTrade(mission, "buy", amount, 0, { approvedMinOut: minOut });
    if (BigInt(quote.out) < minOut) return { step: "moved", mission };
    const call = { ...pad, functionName: "buy", args: [token, minOut, referrer], value: amount } as const;
    let gas: bigint;
    try {
      const { result } = await client.simulateContract({ ...call, blockNumber });
      if (result !== BigInt(quote.out)) throw new TonkError("unavailable", "the contract and the quote disagree");
      gas = padGas(await client.estimateContractGas(call));
    } catch (error) {
      throw error instanceof TonkError ? error : refusal(error);
    }
    await requireFunds(client, trader, amount, gas);
    return { step: "trade", tx: unsigned(network.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "buy", args: call.args }), amount, gas), quote, mission };
  }

  const coin = { address: token, abi: TOKEN_ABI } as const;
  const [held, allowance, excluded] = await Promise.all([
    client.readContract({ ...coin, functionName: "balanceOf", args: [trader], blockNumber }),
    client.readContract({ ...coin, functionName: "allowance", args: [trader, network.launchpad], blockNumber }),
    client.readContract({ ...coin, functionName: "isExcludedFromCrew", args: [trader], blockNumber }),
  ]).catch(() => {
    throw new TonkError("unavailable", "balance unreadable");
  });
  if (held < amount) throw new TonkError("tokens", "not enough tokens", 409);
  // The contract checks the eligible supply after the sold tokens reach the (excluded) launchpad.
  const quote = quoteTrade(mission, "sell", amount, 0, { approvedMinOut: minOut, sellerEligible: !excluded });
  if (BigInt(quote.out) < minOut) return { step: "moved", mission };

  if (allowance < amount) {
    // Exactly the amount being sold, never unlimited.
    const approve = { ...coin, functionName: "approve", args: [network.launchpad, amount], account: trader } as const;
    const gas = padGas(await client.estimateContractGas(approve).catch((error) => {
      throw refusal(error);
    }));
    await requireFunds(client, trader, BigInt(0), gas);
    return { step: "approve", tx: unsigned(token, encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve", args: approve.args }), BigInt(0), gas), mission };
  }

  const call = { ...pad, functionName: "sell", args: [token, amount, minOut, referrer] } as const;
  let gas: bigint;
  try {
    const { result } = await client.simulateContract({ ...call, blockNumber });
    if (result !== BigInt(quote.out)) throw new TonkError("unavailable", "the contract and the quote disagree");
    gas = padGas(await client.estimateContractGas(call));
  } catch (error) {
    throw error instanceof TonkError ? error : refusal(error);
  }
  await requireFunds(client, trader, BigInt(0), gas);
  return { step: "trade", tx: unsigned(network.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "sell", args: call.args }), BigInt(0), gas), quote, mission };
}
