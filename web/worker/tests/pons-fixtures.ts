import { PONS_TOPICS, type RpcLog, SELECTORS } from "../src/sources/pons";
import type { PonsRpc } from "../src/sources/robinhood";
import raw from "./fixtures/pons-logs.json";

/**
 * A real Pons launch on Robinhood Chain (native-ETH quoted, graduating at 4.2
 * ETH) and its first 15 curve trades, as the public RPC returned them: the
 * creator's buy in the launch transaction, 13 more buys and one sell.
 */
export const LOGS = raw as { launch: RpcLog; trades: RpcLog[] };
export const LAUNCH_BLOCK = 107_857_724;
/** The launch block's time in seconds (the logs themselves carry 0x0). */
export const LAUNCH_TIME = 1_793_996_339;
export const TOKEN = "0xbb7e691bb9bbf1d316c3e1bf7058134ff06e24a9";
export const CURVE = "0x3b4692e3f300bafd1f91f564ebf1edb49e96e9f8";

/** Block times for these tests: 0.1 s apart, counted from the launch block. */
export const blockSeconds = (block: number) => LAUNCH_TIME + (block - LAUNCH_BLOCK) * 0.1;
export const timeOf = (block: number) => blockSeconds(block) * 1000;
export const blockOf = (log: RpcLog) => Number(BigInt(log.blockNumber));

/** A Solidity `string` return value. */
export function abiString(text: string): string {
  const hex = Buffer.from(text, "utf8").toString("hex");
  const body = hex.padEnd(Math.max(64, Math.ceil(hex.length / 64) * 64), "0");
  return "0x" + (32).toString(16).padStart(64, "0") + Buffer.byteLength(text).toString(16).padStart(64, "0") + body;
}

export const uint = (n: number) => "0x" + n.toString(16).padStart(64, "0");

/** A buy log like the fixture's, moved to another block. */
export function buyAt(block: number, template: RpcLog = LOGS.trades[1]): RpcLog {
  return { ...template, blockNumber: "0x" + block.toString(16), transactionHash: "0x" + block.toString(16).padStart(64, "0") };
}

/** Robinhood Chain in memory: a head block, some logs, and token contracts that answer name/symbol/logo/decimals. */
export class FakeRpc implements PonsRpc {
  readonly ranges: Array<[number, number]> = [];

  constructor(
    public head: number,
    public logList: RpcLog[],
    private readonly meta: Record<string, string> = {
      [SELECTORS.name]: abiString("Mock Token"),
      [SELECTORS.symbol]: abiString("$MOCK"),
      [SELECTORS.logo]: abiString("ipfs://bafkreifennbmfxys7wj2rlyrxsfkbscatoukxrmf7ihga6a4jzahbduwm4"),
      [SELECTORS.decimals]: uint(18),
    },
  ) {}

  async blockNumber(): Promise<number> {
    return this.head;
  }

  async blockTime(block: number): Promise<number> {
    return blockSeconds(block);
  }

  async logs(from: number, to: number, topics: readonly string[]): Promise<RpcLog[]> {
    this.ranges.push([from, to]);
    return this.logList.filter((l) => blockOf(l) >= from && blockOf(l) <= to && topics.includes(l.topics[0]));
  }

  async call(_to: string, data: string): Promise<string | null> {
    return this.meta[data] ?? null;
  }
}

export const ALL_TOPICS = Object.values(PONS_TOPICS);
