import { type Abi, decodeFunctionResult, encodeFunctionData } from "viem";
import { type AlertRpc, type RpcCall, type RpcReply, RpcFailure, resultOf } from "./rpc";
import { type Address, type Hex, hexOf, type RawLog, type RawReceipt, type RawTx, toNumber } from "./types";

/** One call and how to read its answer. */
export interface Read<T> {
  call: RpcCall;
  parse: (reply: RpcReply) => T;
}

/** Calls collected from several places and sent as one batch; each `add` returns a getter for its answer. */
export class Batch {
  private readonly entries: Array<{ call: RpcCall; settle: (reply: RpcReply) => void }> = [];

  add<T>(read: Read<T>): () => T {
    let settled = false;
    let value: T | undefined;
    let failure: unknown = null;
    this.entries.push({
      call: read.call,
      settle: (reply) => {
        settled = true;
        try {
          value = read.parse(reply);
        } catch (error) {
          failure = error;
        }
      },
    });
    return () => {
      if (!settled) throw new RpcFailure("read before its batch ran");
      if (failure !== null) throw failure;
      return value as T;
    };
  }

  get size(): number {
    return this.entries.length;
  }

  async run(rpc: AlertRpc): Promise<void> {
    if (this.entries.length === 0) return;
    const replies = await rpc.send(this.entries.map((entry) => entry.call));
    this.entries.forEach((entry, i) => entry.settle(replies[i] ?? { error: { code: null, message: "no answer", data: null } }));
  }
}

/** One read on its own. */
export async function one<T>(rpc: AlertRpc, read: Read<T>): Promise<T> {
  const [reply] = await rpc.send([read.call]);
  return read.parse(reply);
}

/** A revert, as opposed to a node that couldn't answer. */
export function isRevert(reply: RpcReply): boolean {
  if (!("error" in reply)) return false;
  return reply.error.code === 3 || /revert/i.test(reply.error.message);
}

const ethCall = (tx: Record<string, string>, block: number, override?: Record<string, { balance: Hex }>): RpcCall => ({
  method: "eth_call",
  params: override ? [tx, hexOf(block), override] : [tx, hexOf(block)],
});

/** A view's decoded answer at `block`; null when it reverts. Any other failure throws, so a node that lags is never read as a change. */
export function view<T>(to: Address, abi: Abi, functionName: string, args: readonly unknown[], block: number, map: (value: unknown) => T): Read<T | null> {
  const data = encodeFunctionData({ abi, functionName, args });
  return {
    call: ethCall({ to, data }, block),
    parse: (reply) => {
      if (isRevert(reply)) return null;
      const result = resultOf(reply, `eth_call ${functionName}`) as Hex;
      if (result === "0x") return null;
      return map(decodeFunctionResult({ abi, functionName, data: result }));
    },
  };
}

/** The raw answer to a simulated call from `from` holding `balance` (a state override), for the graduation dry run. */
export function simulate(from: Address, to: Address, data: Hex, value: bigint, balance: bigint, block: number): Read<RpcReply> {
  return { call: ethCall({ from, to, data, value: hexOf(value) }, block, { [from]: { balance: hexOf(balance) } }), parse: (reply) => reply };
}

export const head = (): Read<number> => ({
  call: { method: "eth_blockNumber", params: [] },
  parse: (reply) => toNumber(resultOf(reply, "eth_blockNumber") as string),
});

/** A block's time in seconds. */
export const blockTime = (block: number): Read<number> => ({
  call: { method: "eth_getBlockByNumber", params: [hexOf(block), false] },
  parse: (reply) => toNumber((resultOf(reply, "eth_getBlockByNumber") as { timestamp: string }).timestamp),
});

export const logs = (from: number, to: number, addresses: readonly Address[]): Read<RawLog[]> => ({
  call: { method: "eth_getLogs", params: [{ fromBlock: hexOf(from), toBlock: hexOf(to), address: addresses }] },
  parse: (reply) => {
    const result = resultOf(reply, "eth_getLogs");
    if (!Array.isArray(result)) throw new RpcFailure("eth_getLogs: not a list");
    return result as RawLog[];
  },
});

export const balance = (address: Address, block: number): Read<bigint> => ({
  call: { method: "eth_getBalance", params: [address, hexOf(block)] },
  parse: (reply) => BigInt(resultOf(reply, "eth_getBalance") as string),
});

/** Whether an address holds code (a Safe) at `block`. */
export const hasCode = (address: Address, block: number): Read<boolean> => ({
  call: { method: "eth_getCode", params: [address, hexOf(block)] },
  parse: (reply) => {
    const code = resultOf(reply, "eth_getCode");
    return typeof code === "string" && code !== "0x" && code !== "0x0";
  },
});

export const receipt = (hash: string): Read<RawReceipt | null> => ({
  call: { method: "eth_getTransactionReceipt", params: [hash] },
  parse: (reply) => (resultOf(reply, "eth_getTransactionReceipt") as RawReceipt | null) ?? null,
});

export const transaction = (hash: string): Read<RawTx | null> => ({
  call: { method: "eth_getTransactionByHash", params: [hash] },
  parse: (reply) => (resultOf(reply, "eth_getTransactionByHash") as RawTx | null) ?? null,
});
