import { describe, expect, it, vi } from "vitest";
import { type BotApi, TelegramError } from "../src/telegram/api";
import { Poller } from "../src/telegram/poller";
import type { TgUpdate } from "../src/telegram/types";

/**
 * A poller fed one batch, whose next getUpdates stays open, over a handler
 * that holds every update until released: what is in flight, waiting and dropped.
 */
function busyPoller(batch: TgUpdate[], options: { priority?: (u: TgUpdate) => boolean; bufferMax?: number }) {
  const started: number[] = [];
  const release = new Map<number, () => void>();
  let open: (updates: TgUpdate[]) => void = () => {};
  let polls = 0;
  const api: BotApi = {
    call: <T>() => {
      polls += 1;
      return (polls === 1 ? Promise.resolve(batch) : new Promise<TgUpdate[]>((resolve) => (open = resolve))) as Promise<T>;
    },
  };
  const log = vi.fn();
  const handle = (u: TgUpdate) => {
    started.push(u.update_id);
    return new Promise<void>((resolve) => release.set(u.update_id, resolve));
  };
  const poller = new Poller(api, handle, log, async () => {}, () => 1_000_000, options);
  const running = poller.run();
  const end = async () => {
    poller.stop();
    open([]);
    await running;
  };
  return { poller, started, release: (id: number) => release.get(id)?.(), log, end };
}

const updates = (from: number, count: number): TgUpdate[] => Array.from({ length: count }, (_, i) => ({ update_id: from + i }));

describe("Poller when busy", () => {
  it("keeps the community's updates waiting past 100 in flight, in order, and confirms the rest without an answer", async () => {
    const community = (u: TgUpdate) => u.update_id > 100 && u.update_id !== 102;
    const p = busyPoller(updates(1, 104), { priority: community });
    await vi.waitFor(() => expect(p.started).toHaveLength(100));
    expect(p.poller.buffered).toBe(3);
    expect(p.poller.health.dropped).toBe(1);
    expect(p.log).toHaveBeenCalledWith("busy: 1 updates confirmed without an answer so far");
    p.release(1);
    await vi.waitFor(() => expect(p.started.at(-1)).toBe(101));
    p.release(2);
    p.release(3);
    await vi.waitFor(() => expect(p.started.slice(100)).toEqual([101, 103, 104]));
    expect(p.poller.buffered).toBe(0);
    await p.end();
  });

  it("drops priority updates too once its buffer is full, and forgets the buffer when stopped", async () => {
    const p = busyPoller(updates(1, 104), { priority: () => true, bufferMax: 2 });
    await vi.waitFor(() => expect(p.started).toHaveLength(100));
    expect(p.poller.buffered).toBe(2);
    expect(p.poller.health.dropped).toBe(2);
    await p.end();
    expect(p.poller.buffered).toBe(0);
    p.release(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.started).toHaveLength(100);
  });

  it("never lets a failing priority check or handler stop the loop", async () => {
    const p = busyPoller(updates(1, 101), { priority: () => { throw new Error("boom"); } });
    await vi.waitFor(() => expect(p.started).toHaveLength(100));
    expect(p.poller.health.dropped).toBe(1);
    await p.end();
    let polls = 0;
    const api: BotApi = {
      call: async <T>() => {
        polls += 1;
        if (polls > 1) throw new TelegramError(401, "Unauthorized", null);
        return [{ update_id: 1 }] as T;
      },
    };
    const log = vi.fn();
    const failing = new Poller(api, () => { throw new TypeError("sync"); }, log, async () => {});
    await failing.run();
    expect(failing.health.updates).toBe(1);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("an update failed: TypeError"));
  });
});
