import { concatHex, getAddress, type Hex, keccak256, numberToHex, pad, toFunctionSelector, toHex, toRlp } from "viem";
import { sameAddress } from "@/shared/lib/address";
import type { RpcCall } from "@/shared/wallet/rpc";
import type { BridgeStatus } from "../lib/types";
import { BridgeError, isRecord } from "./config";
import type { ProviderPlan } from "./plan";
import type { BridgeRequest } from "./request";

/** Robinhood Chain's Delayed Inbox on Ethereum (docs.robinhood.com/chain/protocol-contracts). */
export const INBOX = "0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D";
export const DEPOSIT_ETH = toFunctionSelector("depositEth()");
const CHILD_CHAIN_ID = 4663;
const DELIVERED_TOPIC = keccak256(toHex("InboxMessageDelivered(uint256,bytes)"));
/** Arbitrum's L1-to-L2 address offset. */
const ALIAS_OFFSET = BigInt("0x1111000000000000000000000000000000001111");
const ADDRESS_SPACE = BigInt(1) << BigInt(160);
/** Deposits typically land in about ten minutes. */
const ETA_SECONDS = 600;
/** What a deposit costs in gas, with room to spare. */
export const DEPOSIT_GAS = BigInt(120_000);

/** Only ETH, from Ethereum to Robinhood Chain, into the sender's own address: that's all depositEth() does. */
export const canonicalApplies = (request: BridgeRequest): boolean =>
  request.from.id === "eth" && request.to.id === "rh" && request.asset.native && request.receive.native && !request.gasTopUp && sameAddress(request.sender, request.recipient);

/**
 * A contract sender (a Safe, a smart account, an EOA delegated under
 * EIP-7702) is credited at an aliased address it may not control on the other
 * side, so depositEth() is only for plain wallets.
 */
export async function isPlainWallet(rpc: RpcCall, address: string): Promise<boolean> {
  return (await rpc("eth_getCode", [address, "latest"])) === "0x";
}

export function canonicalPlan(request: BridgeRequest): ProviderPlan {
  if (!canonicalApplies(request)) throw new BridgeError("no-route", "canonical: not this transfer");
  return {
    route: {
      id: "canonical",
      provider: "canonical",
      name: "Arbitrum canonical bridge",
      outAmount: request.amount,
      minOut: request.amount,
      etaSeconds: ETA_SECONDS,
      inUsd: null,
      outUsd: null,
      feeUsd: 0,
      networkUsd: null,
      gasTopUp: null,
      trustless: true,
    },
    tracking: { provider: "canonical", requestId: null, tool: null },
    spender: null,
    evm: { chainId: request.from.chainId, to: INBOX, data: DEPOSIT_ETH, value: request.amount, gas: null },
    solana: null,
  };
}

const aliased = (address: string) => getAddress(pad(toHex((BigInt(address) + ALIAS_OFFSET) % ADDRESS_SPACE), { size: 20 }));
const minimal = (value: bigint): Hex => {
  if (value === BigInt(0)) return "0x";
  const hex = numberToHex(value).slice(2);
  return `0x${hex.length % 2 ? `0${hex}` : hex}`;
};

/**
 * The hash a deposit gets on Robinhood Chain: the RLP of its fields behind
 * type byte 0x64, as Arbitrum's own SDK computes it. Checked against real
 * deposits on the chain.
 */
export function depositTxId(messageNumber: bigint, sender: string, value: bigint): Hex {
  const fields: Hex[] = [minimal(BigInt(CHILD_CHAIN_ID)), pad(minimal(messageNumber), { size: 32 }), aliased(sender), getAddress(sender), minimal(value)];
  return keccak256(concatHex(["0x64", toRlp(fields)]));
}

/** The message number from the deposit's receipt on Ethereum, or null if it holds no such event. */
export function messageNumberOf(receipt: unknown): bigint | null {
  if (!isRecord(receipt) || !Array.isArray(receipt.logs)) return null;
  for (const log of receipt.logs) {
    if (!isRecord(log) || typeof log.address !== "string" || !sameAddress(log.address, INBOX) || !Array.isArray(log.topics)) continue;
    if (log.topics[0] === DELIVERED_TOPIC && typeof log.topics[1] === "string") return BigInt(log.topics[1]);
  }
  return null;
}

/** Follows a deposit across: it has landed when its transaction exists on Robinhood Chain. */
export async function canonicalStatus(input: { receipt: unknown; sender: string; raw: string; child: RpcCall }): Promise<BridgeStatus> {
  const number = messageNumberOf(input.receipt);
  if (number === null) return { state: "transit", destinationTx: null };
  const id = depositTxId(number, input.sender, BigInt(input.raw));
  const landed = await input.child("eth_getTransactionReceipt", [id]).catch(() => null);
  return isRecord(landed) && landed.status === "0x1" ? { state: "delivered", destinationTx: id } : { state: "transit", destinationTx: null };
}
