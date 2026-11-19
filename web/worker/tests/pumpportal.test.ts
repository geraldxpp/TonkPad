import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectPumpPortal, type FeedSocket } from "../src/sources/pumpportal";

/**
 * A stand-in for the feed's socket. With `closeFiresError`, close() fires `error` again at once,
 * as undici's WebSocket does on a connection that has failed: the path that overflowed the stack
 * and crashed the worker on 18 Nov 2026.
 */
class FakeSocket implements FeedSocket {
  sent: string[] = [];
  closeCalls = 0;
  onopen: FeedSocket["onopen"] = null;
  onmessage: FeedSocket["onmessage"] = null;
  onclose: FeedSocket["onclose"] = null;
  onerror: FeedSocket["onerror"] = null;

  constructor(private readonly closeFiresError: boolean) {}

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.closeCalls += 1;
    if (this.closeCalls > 100) throw new Error("close() re-entered");
    if (this.closeFiresError) this.fire("error");
  }

  fire(kind: "open" | "error" | "close"): void {
    const self = this as unknown as WebSocket;
    if (kind === "open") this.onopen?.call(self, new Event("open"));
    if (kind === "error") this.onerror?.call(self, new Event("error"));
    if (kind === "close") this.onclose?.call(self, new Event("close") as CloseEvent);
  }

  message(data: string): void {
    this.onmessage?.call(this as unknown as WebSocket, new MessageEvent("message", { data }));
  }
}

function harness(closeFiresError = false) {
  const sockets: FakeSocket[] = [];
  const onLaunch = vi.fn();
  const onGraduation = vi.fn();
  const feed = connectPumpPortal({ onLaunch, onGraduation }, () => {
    const socket = new FakeSocket(closeFiresError);
    sockets.push(socket);
    return socket;
  });
  return { sockets, onLaunch, onGraduation, feed };
}

describe("connectPumpPortal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("survives a socket whose close() fires error again, and reconnects once", () => {
    const { sockets, feed } = harness(true);
    expect(() => sockets[0].fire("error")).not.toThrow();
    expect(sockets[0].closeCalls).toBe(1);
    expect(sockets[0].onerror).toBeNull();
    expect(sockets[0].onclose).toBeNull();

    sockets[0].fire("close");
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
    feed.close();
  });

  it("treats an error followed by a close as one disconnect", () => {
    const { sockets, feed } = harness();
    sockets[0].fire("error");
    sockets[0].fire("close");
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(2);
    feed.close();
  });

  it("subscribes on open, passes launches and graduations on, and resets the backoff", () => {
    const { sockets, onLaunch, onGraduation, feed } = harness();
    sockets[0].fire("close");
    vi.advanceTimersByTime(1_000);
    sockets[1].fire("close");
    vi.advanceTimersByTime(1_999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2].fire("open");
    expect(sockets[2].sent.map((s) => JSON.parse(s).method)).toEqual(["subscribeNewToken", "subscribeMigration"]);
    sockets[2].message(JSON.stringify({ txType: "create", mint: "MintA", pool: "pump", name: "A", symbol: "A" }));
    sockets[2].message(JSON.stringify({ txType: "migrate", mint: "MintB" }));
    sockets[2].message("not json");
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onGraduation).toHaveBeenCalledTimes(1);

    sockets[2].fire("close");
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(4);
    feed.close();
  });

  it("ignores everything an ended socket fires later", () => {
    const { sockets, onLaunch, feed } = harness();
    const stale = sockets[0];
    const onmessage = stale.onmessage;
    stale.fire("close");
    expect([stale.onopen, stale.onmessage, stale.onclose, stale.onerror]).toEqual([null, null, null, null]);
    const create = JSON.stringify({ txType: "create", mint: "MintA", pool: "pump", name: "A", symbol: "A" });
    onmessage?.call(stale as unknown as WebSocket, new MessageEvent("message", { data: create }));
    expect(onLaunch).not.toHaveBeenCalled();
    feed.close();
  });

  it("stops for good on close(), even with a retry pending", () => {
    const { sockets, feed } = harness();
    sockets[0].fire("error");
    feed.close();
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
  });

  it("closes the live socket on close() without reconnecting", () => {
    const { sockets, feed } = harness(true);
    sockets[0].fire("open");
    feed.close();
    expect(sockets[0].closeCalls).toBe(1);
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
  });

  it("retries when opening the socket throws", () => {
    let calls = 0;
    const feed = connectPumpPortal({ onLaunch: vi.fn(), onGraduation: vi.fn() }, () => {
      calls += 1;
      if (calls === 1) throw new Error("bad url");
      return new FakeSocket(false);
    });
    expect(calls).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(calls).toBe(2);
    feed.close();
  });
});
