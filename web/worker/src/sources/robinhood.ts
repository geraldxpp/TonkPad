import type { RpcLog } from "./pons";

/** The chain reads the Pons feed needs; RobinhoodRpc is the real one, tests pass a fake. */
export interface PonsRpc {
  blockNumber(): Promise<number>;
  /** A block's time, in seconds. */
  blockTime(block: number): Promise<number>;
  /** Logs whose topic0 is one of `topics`, from any contract. */
  logs(from: number, to: number, topics: readonly string[]): Promise<RpcLog[]>;
  /** eth_call; null when it reverts or fails. */
  call(to: string, data: string): Promise<string | null>;
}

const hex = (n: number) => "0x" + n.toString(16);

/** JSON-RPC over HTTP. Robinhood Chain's public RPC serves 10,000-block log queries. */
export class RobinhoodRpc implements PonsRpc {
  private id = 0;

  constructor(private readonly url: string) {}

  private async request<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Robinhood RPC HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(`Robinhood RPC ${method}: ${body.error.message ?? "error"}`);
    return body.result as T;
  }

  async blockNumber(): Promise<number> {
    return Number(BigInt(await this.request<string>("eth_blockNumber", [])));
  }

  async blockTime(block: number): Promise<number> {
    const b = await this.request<{ timestamp: string }>("eth_getBlockByNumber", [hex(block), false]);
    return Number(BigInt(b.timestamp));
  }

  logs(from: number, to: number, topics: readonly string[]): Promise<RpcLog[]> {
    return this.request<RpcLog[]>("eth_getLogs", [{ fromBlock: hex(from), toBlock: hex(to), topics: [topics] }]);
  }

  call(to: string, data: string): Promise<string | null> {
    return this.request<string>("eth_call", [{ to, data }, "latest"]).catch(() => null);
  }
}
