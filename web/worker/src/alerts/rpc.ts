/** One JSON-RPC call. */
export interface RpcCall {
  method: string;
  params: readonly unknown[];
}

/** A call's answer: its result, or the node's error (a revert carries its data). */
export type RpcReply = { result: unknown } | { error: { code: number | null; message: string; data: string | null } };

/** The chain as the watcher sees it: batches of JSON-RPC calls. HttpRpc is the real one; tests answer from fixtures. */
export interface AlertRpc {
  send(calls: readonly RpcCall[]): Promise<RpcReply[]>;
}

/** The request as a whole failed (HTTP, network, timeout). Its message never carries the RPC's URL. */
export class RpcFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcFailure";
  }
}

interface Envelope {
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown; data?: unknown };
}

function replyOf(envelope: Envelope | undefined): RpcReply {
  if (!envelope) return { error: { code: null, message: "no answer", data: null } };
  if (envelope.error) {
    const { code, message, data } = envelope.error;
    return { error: { code: typeof code === "number" ? code : null, message: typeof message === "string" ? message : "error", data: typeof data === "string" ? data : null } };
  }
  return { result: envelope.result };
}

/** JSON-RPC over HTTP, batched (Robinhood Chain's public RPC answers batches and 10,000-block log queries). */
export class HttpRpc implements AlertRpc {
  private nextId = 0;

  constructor(
    private readonly url: string,
    private readonly timeoutMs = 20_000,
    private readonly maxBatch = 50,
  ) {}

  async send(calls: readonly RpcCall[]): Promise<RpcReply[]> {
    const replies: RpcReply[] = [];
    for (let i = 0; i < calls.length; i += this.maxBatch) replies.push(...(await this.post(calls.slice(i, i + this.maxBatch))));
    return replies;
  }

  private async post(calls: readonly RpcCall[]): Promise<RpcReply[]> {
    const ids = calls.map(() => ++this.nextId);
    const body = calls.map((call, i) => ({ jsonrpc: "2.0", id: ids[i], method: call.method, params: call.params }));
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RpcFailure(error instanceof Error && error.name === "TimeoutError" ? "RPC timed out" : "RPC unreachable");
    }
    if (!res.ok) throw new RpcFailure(`RPC HTTP ${res.status}`);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new RpcFailure("RPC answered with something other than JSON");
    }
    if (!Array.isArray(parsed)) throw new RpcFailure("RPC refused the batch");
    const byId = new Map<unknown, Envelope>((parsed as Envelope[]).map((envelope) => [envelope?.id, envelope]));
    return ids.map((id) => replyOf(byId.get(id)));
  }
}

/** A reply's result, or a thrown RpcFailure naming the method (never the URL). */
export function resultOf(reply: RpcReply, what: string): unknown {
  if ("error" in reply) throw new RpcFailure(`${what}: ${reply.error.message.slice(0, 160)}`);
  return reply.result;
}
