import { readFileSync } from "node:fs";
import { type Abi, type AbiEvent, encodeAbiParameters, encodeEventTopics, getAbiItem } from "viem";
import { type AlertContext, short } from "../src/alerts/alert";
import type { AlertConfig } from "../src/alerts/config";
import type { AlertRpc, RpcCall, RpcReply } from "../src/alerts/rpc";
import { type Address, hexOf, lower, type RawLog, type RawReceipt, type RawTx, toNumber } from "../src/alerts/types";
import { CONFIRMATIONS } from "../src/alerts/watcher";

/**
 * Fixtures for the alert tests. The testnet-*.json files are recorded
 * read-only from Robinhood Chain Testnet's public RPC. That is the testnet
 * release: the mainnet build's events minus its newer ones, and the same ETH
 * accounting except that it keeps the launch-block tax in the curve, which
 * the mainnet build burns (F-1). frozen-abi.json is the mainnet build's ABI.
 * Events testnet has never emitted (a pause, a Safe's transactions…) are
 * built from that ABI with `built()`; `alerts-scenario.ts` builds the
 * mainnet build's launch-block tax and graduation.
 */
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/alerts/${name}`, import.meta.url), "utf8")) as T;

export interface RecordedReply {
  label: string;
  request: RpcCall;
  reply: RpcReply;
}

export const RECORDED = {
  logs: read<{ fromBlock: number; toBlock: number; logs: RawLog[] }>("testnet-logs.json"),
  head: read<{ block: number; balances: { launchpad: string; migrator: string }; replies: RecordedReply[] }>("testnet-head.json"),
  graduation: read<{ tx: RawTx; receipt: RawReceipt }>("testnet-graduation.json"),
  abi: read<{ launchpad: Abi; migrator: Abi; guard: Abi; ownerOnly: { launchpad: string[]; migrator: string[] } }>("frozen-abi.json"),
};

export const LAUNCHPAD: Address = "0xb9bb81242ce7b40775ceadf3b591411f0320ec82";
export const MIGRATOR: Address = "0x6c0fb62e5652eb6c2a257eebba75ad2dce708909";
export const GUARD: Address = "0x42d543c4586c68e198e067a77a2189c9abb72000";
export const POOL_MANAGER: Address = "0x5b29d2869a76ceeb969d090ba73cac506b128519";
export const POSITION_MANAGER: Address = "0x1ca06c75d07733c0e53bfb0228f1fd1e99cb5a7b";
export const OWNER: Address = "0xd0d0620bcf60f15a0ac75753fcc0ebf2d65b268f";
/** The testnet wallet that bought, sold and graduated a curve. */
export const TRADER: Address = lower(RECORDED.graduation.tx.from);
/** The one testnet token that graduated, in GRADUATION_TX. */
export const GRADUATED: Address = "0x952a8c953f42216e8333435fd2d8819d6cd9e96a";
export const GRADUATION_TX = "0x377ced429bbd5d300b478bdfe4b9eccc60605d5e08fe5021ad940bf986ec1cc8";
/** The live curve furthest along at the recorded block (17.5% sold). */
export const LEADER: Address = "0xeac30db90c3ac240d0122a07e46be8c161051a8a";
export const HEAD = RECORDED.head.block;
export const START_BLOCK = RECORDED.logs.fromBlock;
export const ETH = BigInt("1000000000000000000");

export function testConfig(overrides: Partial<AlertConfig> = {}): AlertConfig {
  return {
    chainId: 46630,
    networkName: "Robinhood Chain Testnet",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    launchpad: LAUNCHPAD,
    migrator: MIGRATOR,
    guard: null,
    startBlock: START_BLOCK,
    rpcUrl: "https://rpc.example/secret-rpc-key",
    pollMs: 10_000,
    largeOutflowWei: ETH,
    repeatMs: 30 * 60_000,
    maxLagSeconds: 90,
    checkFromBps: 5_000,
    summaryMs: 0,
    heartbeatUrl: null,
    telegram: null,
    webhookUrl: null,
    dryRun: false,
    statePath: "/tmp/never-written.json",
    secrets: [],
    ...overrides,
  };
}

export const ctx: AlertContext = { explorerUrl: "https://explorer.testnet.chain.robinhood.com", launchpad: LAUNCHPAD, migrator: MIGRATOR, token: (address) => short(address) };

let nextLog = 1000;

/** A log built from an ABI, for an event the recorded history doesn't hold. */
export function built(abi: Abi, eventName: string, args: Record<string, unknown>, at: { address: string; block?: number; tx?: string; logIndex?: number }): RawLog {
  const item = getAbiItem({ abi, name: eventName }) as AbiEvent;
  const plain = item.inputs.filter((input) => !input.indexed);
  return {
    address: at.address,
    topics: encodeEventTopics({ abi: [item], eventName, args } as never) as string[],
    data: encodeAbiParameters(plain, plain.map((input) => args[input.name ?? ""])),
    blockNumber: hexOf(at.block ?? HEAD),
    transactionHash: at.tx ?? `0x${(nextLog++).toString(16).padStart(64, "0")}`,
    logIndex: hexOf(at.logIndex ?? 0),
  };
}

/** The key a recorded eth_call is found by: target, calldata and (for a simulation) sender. */
const callKey = (params: readonly unknown[]) => {
  const tx = params[0] as { to: string; data: string; from?: string };
  return `${tx.to.toLowerCase()}|${tx.data.toLowerCase()}|${(tx.from ?? "").toLowerCase()}`;
};

/** An RPC for tests: answers from `handler` first, then from the recorded testnet replies; anything else is an error. */
export class FakeRpc implements AlertRpc {
  readonly calls: RpcCall[] = [];
  head = HEAD + CONFIRMATIONS;
  logs: RawLog[] = RECORDED.logs.logs;
  balances: Record<string, bigint> = { [LAUNCHPAD]: BigInt(RECORDED.head.balances.launchpad), [MIGRATOR]: BigInt(RECORDED.head.balances.migrator) };
  fail: string | null = null;
  private readonly recorded = new Map<string, RpcReply>();

  /** Answers first, when it returns a reply. */
  handler: (call: RpcCall) => RpcReply | undefined;

  constructor(handler: (call: RpcCall) => RpcReply | undefined = () => undefined) {
    this.handler = handler;
    for (const { request, reply } of RECORDED.head.replies) {
      const key = request.method === "eth_call" ? callKey(request.params) : `${request.method}|${JSON.stringify(request.params)}`;
      this.recorded.set(key, reply);
    }
  }

  async send(calls: readonly RpcCall[]): Promise<RpcReply[]> {
    if (this.fail) throw new Error(this.fail);
    this.calls.push(...calls);
    return calls.map((call) => this.handler(call) ?? this.answer(call));
  }

  private answer(call: RpcCall): RpcReply {
    const { method, params } = call;
    if (method === "eth_blockNumber") return { result: hexOf(this.head) };
    if (method === "eth_getBalance") return { result: hexOf(this.balances[lower(params[0] as string)] ?? BigInt(0)) };
    if (method === "eth_getBlockByNumber") return { result: { timestamp: hexOf(Math.round(toNumber(params[0] as string) * 0.17)) } };
    if (method === "eth_getCode") return { result: "0x" };
    if (method === "eth_getLogs") {
      const { fromBlock, toBlock, address } = params[0] as { fromBlock: string; toBlock: string; address: string[] };
      const wanted = new Set(address.map(lower));
      return { result: this.logs.filter((log) => wanted.has(lower(log.address)) && toNumber(log.blockNumber) >= toNumber(fromBlock) && toNumber(log.blockNumber) <= toNumber(toBlock)) };
    }
    if (method === "eth_getTransactionReceipt" && params[0] === GRADUATION_TX) return { result: RECORDED.graduation.receipt };
    if (method === "eth_getTransactionByHash" && params[0] === GRADUATION_TX) return { result: RECORDED.graduation.tx };
    const key = method === "eth_call" ? callKey(params) : `${method}|${JSON.stringify(params)}`;
    return this.recorded.get(key) ?? { error: { code: -32000, message: `not recorded: ${method}`, data: null } };
  }
}
