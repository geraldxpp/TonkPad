import { describe, expect, it } from "vitest";
import type { TonkEvent } from "../src/tonk/events";
import type { TonkToken } from "../src/tonk/launch";
import { toToken } from "../src/tokens";
import type { BotApi } from "../src/telegram/api";
import { ChannelPoster, claimsBrand } from "../src/telegram/channel";
import { Sender } from "../src/telegram/sender";
import { emptyState } from "../src/telegram/state";
import { NOW } from "./fixtures";
import { launch, SITE } from "./telegram-fixtures";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const C = "0x00000000000000000000000000000000000000c3";
const OWNER = "0x00000000000000000000000000000000000000ee";
const at = { block: 1, logIndex: 0, tx: "0x1" };
const launched = (token: string): TonkEvent => ({ kind: "launched", token: token as `0x${string}`, creator: "0xc0ffee0000000000000000000000000000000000", name: "X", symbol: "X", crewBps: 0, creatorBps: 0, lockType: 0, ...at });
const simple = (kind: "graduated" | "lockChanged", token: string): TonkEvent => ({ kind, token: token as `0x${string}`, ...at });
const tax = (token: string, wei: bigint): TonkEvent => ({ kind: "bundleTax", token: token as `0x${string}`, sniper: "0x5000000000000000000000000000000000000005", penalty: wei, ...at });
/** Every queued send gets its turn (the Sender's clock is virtual). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function harness(options: { brandCreators?: string[]; skip?: string[] } = {}) {
  let clock = NOW;
  const posts: string[] = [];
  const logs: string[] = [];
  const api: BotApi = {
    call: async <T>(method: string, params: Record<string, unknown>) => {
      if (method === "sendMessage") posts.push(String(params.text));
      return { message_id: posts.length } as T;
    },
  };
  const sender = new Sender(api, () => {}, () => clock, async (ms) => void (clock += ms));
  const tokens = new Map<string, TonkToken>();
  const state = emptyState().channel;
  let card = (t: TonkToken) => toToken(t, clock);
  const poster = new ChannelPoster({
    sender, chatId: "@tonkfun_launches", lang: "en", site: SITE,
    launch: (a) => tokens.get(a) ?? null,
    launches: () => [...tokens.values()],
    card: (t) => card(t),
    brandCreators: new Set(options.brandCreators ?? []), skip: new Set(options.skip ?? []),
    state, persist: () => {}, now: () => clock, log: (line) => void logs.push(line),
  });
  /** Feeds a window of events, as the launchpad feed does, timed `ageMs` ago. */
  const feed = (events: TonkEvent[], ageMs = 0) => poster.onEvents(events, () => clock - ageMs);
  const poll = async (lag = 0) => {
    await poster.afterPoll(lag);
    await settle();
  };
  return { poster, posts, logs, tokens, state, feed, poll, tick: (ms: number) => void (clock += ms), now: () => clock, breakCards: (bad: string) => {
    card = (t) => {
      if (t.address === bad) throw new Error("bad token");
      return toToken(t, clock);
    };
  } };
}

/** A creator lock of 20M tokens (2% of supply), so it earns the Locked badge. */
const lock = (endDays: number) => ({ type: "time" as const, lockedBps: 10_000, start: NOW / 1000, end: NOW / 1000 + endDays * 86_400, total: "20000000000000000000000000", claimed: "0", checkpoint: "0" });
const dust = (endDays: number) => ({ ...lock(endDays), total: "1" });

describe("the official channel", () => {
  it("posts nothing until the feed has caught up, then nothing that was already true", async () => {
    const h = harness();
    const old = launch(A, { ageMs: 2 * 3_600_000 });
    old.curve = 0.6;
    h.tokens.set(A, old);
    h.tokens.set(B, launch(B));
    h.feed([launched(B)]);
    await h.poll(5_000);
    expect(h.posts).toEqual([]);
    await h.poll();
    expect(h.posts).toEqual([]);
    expect(h.state.milestones[A]).toBe(50);
  });

  it("posts a fresh launch once, with its lock and Crew Rewards, and skips a stale one", async () => {
    const h = harness();
    await h.poll();
    h.tokens.set(C, launch(C, { ageMs: 30_000, lock: lock(180), crewBps: 200 }));
    h.tokens.set(A, launch(A, { ageMs: 20 * 60_000 }));
    h.feed([launched(C), launched(C), launched(A)]);
    await h.poll();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]).toContain("<b>New launch</b>");
    expect(h.posts[0]).toContain("100% of the dev buy locked for 180 days");
    expect(h.posts[0]).toContain("Crew Rewards 2%");
    h.feed([launched(C)]);
    await h.poll();
    expect(h.posts).toHaveLength(1);
  });

  it("marks 50% and 90% of the curve once each, only while trading is recent", async () => {
    const h = harness();
    const c = launch(C, { ageMs: 60_000 });
    h.tokens.set(C, c);
    await h.poll();
    c.curve = 0.55;
    c.tonk.trades.push([h.now() - 1_000, 1, 0.1, 1e-9]);
    await h.poll();
    await h.poll();
    c.curve = 0.93;
    await h.poll();
    expect(h.posts.map((p) => p.split("\n")[0])).toEqual(["<b>Halfway to graduation</b>", "<b>Almost graduated</b>"]);
  });

  it("posts a graduation, and a real lock lengthened, once a day", async () => {
    const h = harness();
    const c = launch(C, { ageMs: 60_000, lock: lock(30) });
    h.tokens.set(C, c);
    await h.poll();
    c.graduated = true;
    c.graduatedAt = h.now();
    c.curve = 1;
    c.tonk.lock = lock(90);
    h.feed([simple("graduated", C), simple("lockChanged", C)]);
    await h.poll();
    c.tonk.lock = lock(120);
    h.feed([simple("lockChanged", C)]);
    await h.poll();
    expect(h.posts.map((p) => p.split("\n")[0])).toEqual(["<b>Graduated</b>", "<b>Creator lock extended</b>"]);
  });

  it("never posts a dust lock's extension, or an old one", async () => {
    const h = harness();
    const c = launch(C, { ageMs: 60_000, lock: dust(30) });
    const a = launch(A, { ageMs: 60_000, lock: lock(30) });
    h.tokens.set(C, c);
    h.tokens.set(A, a);
    await h.poll();
    c.tonk.lock = dust(90);
    a.tonk.lock = lock(90);
    h.feed([simple("lockChanged", C)]);
    h.feed([simple("lockChanged", A)], 2 * 3_600_000);
    await h.poll();
    expect(h.posts).toEqual([]);
  });

  it("reports the shield's taxes together once they have settled, naming no wallet", async () => {
    const h = harness();
    h.tokens.set(C, launch(C, { ageMs: 10_000 }));
    await h.poll();
    h.feed([tax(C, BigInt(10) ** BigInt(18)), tax(C, BigInt(5) * BigInt(10) ** BigInt(17))]);
    await h.poll();
    expect(h.posts).toHaveLength(0);
    h.tick(21_000);
    await h.poll();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]).toContain("<b>2 buys</b>");
    expect(h.posts[0]).toContain("<b>1.5</b> ETH burned");
    expect(h.posts[0]).not.toContain("0x5000");
  });

  it("doesn't let one bad event stop the others", async () => {
    const h = harness();
    await h.poll();
    h.tokens.set(A, launch(A, { ageMs: 30_000 }));
    h.tokens.set(C, launch(C, { ageMs: 30_000 }));
    h.breakCards(A);
    h.feed([launched(A), launched(C)]);
    await h.poll();
    expect(h.posts).toHaveLength(1);
    expect(h.logs.some((l) => l.includes("skipped an event"))).toBe(true);
  });

  it("never speaks for a token that uses the brand, unless its creator is the owner's, nor for one on the skip list", async () => {
    const h = harness({ brandCreators: [OWNER], skip: [B] });
    await h.poll();
    const fake = launch(A, { ageMs: 30_000, name: "tonkfun.fun Official Coin" });
    const real = launch(C, { ageMs: 30_000, name: "Tonk" });
    real.creator = OWNER;
    h.tokens.set(A, fake);
    h.tokens.set(C, real);
    h.tokens.set(B, launch(B, { ageMs: 30_000 }));
    h.feed([launched(A), launched(B), launched(C)]);
    await h.poll();
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]).toContain("<b>Tonk</b>");
    expect(h.poster.stats.skipped).toBe(2);
  });

  it("knows the brand when it sees it, look-alikes included, but not ordinary words", () => {
    const yes = [["tonkfun.fun Coin", "X"], ["X", "TONK"], ["TonkPad", "TP"], ["ΤΟΝΚ", "X"], ["Тонк", "X"], ["T̲O̲N̲K̲", "X"], ["T0NK", "X"], ["ｔｏｎｋ", "X"]];
    const no = [["STONKS", "STONK"], ["Whoa", "WHOA"], ["Tonkatsu", "KATSU"], ["Tonka Truck", "TONKA"]];
    expect(yes.map(([n, t]) => claimsBrand(n, t))).toEqual(yes.map(() => true));
    expect(no.map(([n, t]) => claimsBrand(n, t))).toEqual(no.map(() => false));
  });

  it("sees the brand through characters the channel drops, like TO$NK", async () => {
    const h = harness();
    await h.poll();
    h.tokens.set(A, launch(A, { ageMs: 30_000, name: "TO$NK Official" }));
    h.feed([launched(A)]);
    await h.poll();
    expect(h.posts).toEqual([]);
  });

  it("posts a lock extension at most once in 24 hours, across midnight too", async () => {
    const h = harness();
    const c = launch(C, { ageMs: 60_000, lock: lock(30) });
    h.tokens.set(C, c);
    await h.poll();
    c.tonk.lock = lock(60);
    h.feed([simple("lockChanged", C)]);
    await h.poll();
    h.tick(2 * 60_000);
    c.tonk.lock = lock(90);
    h.feed([simple("lockChanged", C)]);
    await h.poll();
    h.tick(24 * 3_600_000);
    c.tonk.lock = lock(120);
    h.feed([simple("lockChanged", C)]);
    await h.poll();
    expect(h.posts).toHaveLength(2);
  });

  it("remembers a lock's new end read during a catch-up, so a later claim isn't news", async () => {
    const h = harness();
    const c = launch(C, { ageMs: 60_000, lock: lock(30) });
    h.tokens.set(C, c);
    await h.poll();
    c.tonk.lock = lock(90);
    h.feed([simple("lockChanged", C)], 3 * 3_600_000);
    await h.poll();
    expect(h.posts).toEqual([]);
    h.feed([simple("lockChanged", C)]);
    await h.poll();
    expect(h.posts).toEqual([]);
  });
});
