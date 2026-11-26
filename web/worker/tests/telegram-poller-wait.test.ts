import { describe, expect, it, vi } from "vitest";
import type { BotApi } from "../src/telegram/api";
import { Poller, type PollerOptions } from "../src/telegram/poller";
import type { TgUpdate } from "../src/telegram/types";

/**
 * What waits in the poller holds members' text (wiring#7, wiring#8): the
 * community's updates held while the agent starts (2 minutes at most), and
 * priority updates waiting for a slot (5 minutes at most), both stale past
 * their time and emptied at a stop.
 */

const MIN = 60_000;

/** A poller fed `batches` one per getUpdates (then a poll that stays open), on a clock the test moves, over a handler that holds updates until released (all at once unless `hold` says so). */
function bench(batches: TgUpdate[][], options: PollerOptions, holdHandler = false) {
  const clock = { now: 1_000_000 };
  const started: number[] = [];
  const release: Array<() => void> = [];
  let open: (updates: TgUpdate[]) => void = () => {};
  const api: BotApi = {
    call: <T>() => {
      const next = batches.shift();
      return (next ? Promise.resolve(next) : new Promise<TgUpdate[]>((resolve) => (open = resolve))) as Promise<T>;
    },
  };
  const log = vi.fn();
  const handle = (u: TgUpdate) => {
    started.push(u.update_id);
    return holdHandler ? new Promise<void>((resolve) => release.push(resolve)) : Promise.resolve();
  };
  const poller = new Poller(api, handle, log, async () => {}, () => clock.now, options);
  const running = poller.run();
  /** Lets the loop take one more batch (or an empty poll), so it prunes what waited. */
  const poll = async (batch: TgUpdate[] = []) => {
    open(batch);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const end = async () => {
    poller.stop();
    open([]);
    await running;
  };
  return { poller, started, release, log, clock, poll, end };
}

const group = (id: number, chat = -100): TgUpdate => ({ update_id: id, message: { message_id: id, date: 0, chat: { id: chat, type: "supergroup" }, text: "hi" } });
const privateChat = (id: number): TgUpdate => ({ update_id: id, message: { message_id: id, date: 0, chat: { id: 11, type: "private" }, text: "/start" } });
const community = (u: TgUpdate) => u.message?.chat.id === -100;

describe("Poller: the community's updates while the agent starts (wiring#7)", () => {
  it("answers everything else at once, holds the community's, and hands them on in order once released", async () => {
    const p = bench([[group(1), privateChat(2), group(3)]], { hold: community });
    await vi.waitFor(() => expect(p.started).toEqual([2]));
    expect(p.poller.holdingCount).toBe(2);
    p.poller.release();
    expect(p.started).toEqual([2, 1, 3]);
    // Released once: from now on nothing is held.
    await p.poll([group(4)]);
    await vi.waitFor(() => expect(p.started).toEqual([2, 1, 3, 4]));
    expect(p.poller.holdingCount).toBe(0);
    await p.end();
  });

  it("drops what was held past 2 minutes as stale, never handing it on", async () => {
    const p = bench([[group(1)]], { hold: community });
    await vi.waitFor(() => expect(p.poller.holdingCount).toBe(1));
    p.clock.now += 2 * MIN;
    await p.poll([group(2)]);
    await vi.waitFor(() => expect(p.poller.holdingCount).toBe(1));
    p.poller.release();
    expect(p.started).toEqual([2]);
    expect(p.poller.health.stale).toBe(1);
    expect(p.log).toHaveBeenCalledWith("stale: 1 waiting updates dropped after their time so far");
    await p.end();
  });

  it("holds nothing without a hold, and release() then changes nothing", async () => {
    const p = bench([[group(1)]], {});
    await vi.waitFor(() => expect(p.started).toEqual([1]));
    p.poller.release();
    expect(p.started).toEqual([1]);
    await p.end();
  });
});

describe("Poller: priority updates waiting for a slot (wiring#8)", () => {
  const busy = () => Array.from({ length: 100 }, (_, i) => privateChat(i + 1));

  it("drops one that waited 5 minutes as stale, and starts the fresher ones when a slot frees", async () => {
    const p = bench([[...busy(), group(101)]], { priority: community }, true);
    await vi.waitFor(() => expect(p.started).toHaveLength(100));
    expect(p.poller.buffered).toBe(1);
    p.clock.now += 5 * MIN;
    await p.poll([group(102)]);
    await vi.waitFor(() => expect(p.poller.buffered).toBe(1));
    p.release[0]();
    await vi.waitFor(() => expect(p.started.at(-1)).toBe(102));
    expect(p.started).not.toContain(101);
    expect(p.poller.health.stale).toBe(1);
    await p.end();
  });

  it("empties what waits and what is held at a stop, and says how many were lost", async () => {
    const p = bench([[...busy(), group(101), group(102, -200)]], { priority: () => true, hold: (u) => u.message?.chat.id === -200 }, true);
    await vi.waitFor(() => expect(p.poller.buffered + p.poller.holdingCount).toBe(2));
    await p.end();
    expect(p.poller.buffered).toBe(0);
    expect(p.poller.holdingCount).toBe(0);
    expect(p.log).toHaveBeenCalledWith("stopped: 2 waiting updates dropped");
    p.poller.release();
    for (const done of p.release) done();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.started).toHaveLength(100);
  });
});
