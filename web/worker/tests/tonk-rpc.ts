import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import type { AlertRpc, RpcCall, RpcReply } from "../src/alerts/rpc";
import { type Address, hexOf, lower, type RawLog, toNumber } from "../src/alerts/types";
import { FEED_VIEWS } from "../src/tonk/abi";
import type { TonkFeedConfig } from "../src/tonk/config";
import { ZERO_ADDRESS } from "../src/tonk/holders";
import { GUARD, LAUNCHPAD, MIGRATOR, POOL_MANAGER, type TonkChain } from "./tonk-chain";
import { LAST_BLOCK, START_BLOCK } from "./tonk-scenario";

export const CONFIG: TonkFeedConfig = { launchpad: LAUNCHPAD, migrator: MIGRATOR, poolManager: POOL_MANAGER, startBlock: START_BLOCK, rpcUrl: "https://rpc.example/secret" };
export const SYSTEM = { launchpad: LAUNCHPAD, migrator: MIGRATOR, poolManager: POOL_MANAGER };

interface LogFilter {
  fromBlock: string;
  toBlock: string;
  address: string | string[];
  topics?: Array<string | string[] | null>;
}

const error = (message: string): RpcReply => ({ error: { code: -32000, message, data: null } });
const matches = (wanted: string | string[] | null | undefined, topic: string | undefined) =>
  wanted === null || wanted === undefined || (Array.isArray(wanted) ? wanted.map(lower).includes(lower(topic ?? "")) : lower(wanted) === lower(topic ?? ""));

/**
 * The scenario's chain as JSON-RPC: logs filtered as a node filters them,
 * the launchpad's, migrator's and guard's views at any block, and block
 * times. `head` moves the story on; `maxRange` refuses longer log queries
 * (as a free plan does); `fail` makes chosen calls fail.
 */
export class FakeRpc implements AlertRpc {
  readonly calls: RpcCall[] = [];
  maxRange = Number.POSITIVE_INFINITY;
  fail: ((call: RpcCall) => boolean) | null = null;
  /** Who the guard says it serves: another migrator makes it someone else's guard. */
  guardMigrator: Address = MIGRATOR;

  constructor(
    readonly chain: TonkChain,
    public head = LAST_BLOCK + 40,
  ) {}

  async send(calls: readonly RpcCall[]): Promise<RpcReply[]> {
    this.calls.push(...calls);
    return calls.map((call) => (this.fail?.(call) ? error("upstream timeout") : this.reply(call)));
  }

  private reply({ method, params }: RpcCall): RpcReply {
    if (method === "eth_blockNumber") return { result: hexOf(this.head) };
    if (method === "eth_getBlockByNumber") return { result: { timestamp: hexOf(this.chain.timeOf(toNumber(String(params[0])))) } };
    if (method === "eth_getLogs") return this.logs(params[0] as LogFilter);
    if (method === "eth_call") {
      const { to, data } = params[0] as { to: string; data: Hex };
      return this.call(lower(to), data, toNumber(String(params[1])));
    }
    return error(`unexpected ${method}`);
  }

  private logs(filter: LogFilter): RpcReply {
    const [from, to] = [toNumber(filter.fromBlock), toNumber(filter.toBlock)];
    if (to - from + 1 > this.maxRange) return error("query exceeds the block range limit");
    if (to > this.head) return error("block range extends past the head");
    const addresses = new Set((Array.isArray(filter.address) ? filter.address : [filter.address]).map(lower));
    const [topic0, topic1] = filter.topics ?? [];
    const found = this.chain.logs.filter((log: RawLog) => {
      const block = toNumber(log.blockNumber);
      return block >= from && block <= to && addresses.has(lower(log.address)) && matches(topic0, log.topics[0]) && matches(topic1, log.topics[1]);
    });
    return { result: found };
  }

  private call(to: Address, data: Hex, block: number): RpcReply {
    const { functionName, args } = decodeFunctionData({ abi: FEED_VIEWS, data });
    const result = (value: unknown): RpcReply => ({ result: encodeFunctionResult({ abi: FEED_VIEWS, functionName, result: value } as never) });
    const state = this.chain.at(block);
    const token = lower(String(args?.[0] ?? ZERO_ADDRESS));
    if (to === LAUNCHPAD && token !== this.chain.token) return error("execution reverted");
    if (to === LAUNCHPAD && functionName === "missions") {
      const c = state.curve;
      const fields = [token, ZERO_ADDRESS, BigInt(this.chain.launchTime), BigInt(this.chain.launchBlock), this.chain.crewBps, this.chain.creatorBps, state.graduated];
      return result([...fields, c.virtualEth, c.virtualTokens, c.realEth, c.tokensLeft, state.graduated ? MIGRATOR : ZERO_ADDRESS, "", this.chain.agentPrompt]);
    }
    if (to === LAUNCHPAD && functionName === "devLocks") return result(state.lock);
    if (to === LAUNCHPAD && functionName === "devVestedCheckpoint") return result(BigInt(0));
    if (to === MIGRATOR && functionName === "poolKey") return result({ currency0: ZERO_ADDRESS, currency1: args?.[0], fee: Number(args?.[1]), tickSpacing: 60, hooks: GUARD });
    if (to === MIGRATOR && functionName === "poolManager") return result(POOL_MANAGER);
    if (to === MIGRATOR && functionName === "initializationGuard") return result(GUARD);
    if (to === GUARD && functionName === "migrator") return result(this.guardMigrator);
    if (to === GUARD && functionName === "poolManager") return result(POOL_MANAGER);
    return error("execution reverted");
  }
}
