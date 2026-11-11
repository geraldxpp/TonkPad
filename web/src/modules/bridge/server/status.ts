import type { BridgeNetwork } from "../lib/networks";
import type { BridgeStatus, RouteProvider } from "../lib/types";
import { acrossStatus } from "./across";
import { canonicalStatus } from "./canonical";
import { type BridgeConfig, isRecord } from "./config";
import { lifiStatus } from "./lifi";
import { relayStatus } from "./relay";
import { rpcFor } from "./rpc";

export interface StatusQuery {
  from: BridgeNetwork;
  to: BridgeNetwork;
  tx: string;
  provider: RouteProvider;
  requestId: string | null;
  tool: string | null;
  sender: string;
  raw: string;
}

/** A Solana signature is 64 bytes in base58; an EVM hash 0x and 32 bytes. */
export const isTxHash = (network: BridgeNetwork, tx: string): boolean => (network.vm === "svm" ? /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(tx) : /^0x[\da-fA-F]{64}$/.test(tx));

type Source = { state: "pending" | "confirmed" | "failed"; receipt: unknown };

/** Whether the first transaction has landed. A network that won't answer counts as still pending. */
export async function sourceState(network: BridgeNetwork, tx: string): Promise<Source> {
  const rpc = rpcFor(network);
  if (network.vm === "svm") {
    const result = await rpc("getSignatureStatuses", [[tx], { searchTransactionHistory: true }]).catch(() => null);
    const entry = isRecord(result) && Array.isArray(result.value) ? result.value[0] : null;
    if (!isRecord(entry)) return { state: "pending", receipt: null };
    if (entry.err) return { state: "failed", receipt: null };
    return { state: entry.confirmationStatus === "confirmed" || entry.confirmationStatus === "finalized" ? "confirmed" : "pending", receipt: null };
  }
  const receipt = await rpc("eth_getTransactionReceipt", [tx]).catch(() => null);
  if (!isRecord(receipt)) return { state: "pending", receipt: null };
  return { state: receipt.status === "0x1" ? "confirmed" : "failed", receipt };
}

const HASH = /^(?:0x[\da-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{80,90})$/;

/** Where a transfer stands: first its source transaction, then its route. A provider's answer goes in a link, so only a real hash is passed on. */
export async function transferStatus(query: StatusQuery, config: BridgeConfig): Promise<BridgeStatus> {
  const status = await rawStatus(query, config);
  return status.destinationTx && !HASH.test(status.destinationTx) ? { ...status, destinationTx: null } : status;
}

async function rawStatus(query: StatusQuery, config: BridgeConfig): Promise<BridgeStatus> {
  const source = await sourceState(query.from, query.tx);
  if (source.state === "failed") return { state: "failed", destinationTx: null };
  if (source.state === "pending") return { state: "source", destinationTx: null };
  switch (query.provider) {
    case "relay":
      return query.requestId ? relayStatus(query.requestId, config) : { state: "transit", destinationTx: null };
    case "across":
      return acrossStatus(query.from.chainId, query.tx, config);
    case "lifi":
      return lifiStatus({ tx: query.tx, tool: query.tool, fromChain: query.from.chainId, toChain: query.to.chainId }, config);
    case "canonical":
      return canonicalStatus({ receipt: source.receipt, sender: query.sender, raw: query.raw, child: rpcFor(query.to) });
  }
}

export const isProvider = (value: unknown): value is RouteProvider => value === "relay" || value === "across" || value === "lifi" || value === "canonical";
