// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ChartBook, type FetchCandles } from "../src/charts/book";
import { chartPools } from "../src/charts/pools";
import type { TrackedToken } from "../src/model";
import { GeckoRateLimitError, type PoolRequest, type RawCandle, type Resolution } from "../src/sources/geckoterminal";
import { address, MIN, NOW, priced, SEC } from "./fixtures";

const T = NOW / 1000;
type Call = [pool: string, resolution: Resolution, limit: number];

/** A book on a hand-moved clock whose fetches answer `rows` (or throw / return null) and are recorded. */
function setup(answer: (request: PoolRequest, resolution: Resolution, limit: number) => RawCandle[] | null = () => [[T, 1e-5, 1e-5, 1e-5, 1e-5, 10]]) {
  const clock = { now: NOW };
  const calls: Call[] = [];
  const fetchCandles: FetchCandles = async (request, resolution, limit) => {
    calls.push([request.pool, resolution, limit]);
    return answer(request, resolution, limit);
  };
  const errors: unknown[] = [];
  const book = new ChartBook(fetchCandles, (error) => errors.push(error), () => clock.now);
  return { clock, calls, book, errors };
}

const token = (label: string, over: Partial<TrackedToken> = {}) =>
  priced(50_000, {}, { address: address(label), pool: address(`Pool${label}`), ...over });
const request = (t: TrackedToken): PoolRequest => ({ network: "solana", pool: t.pool!, token: t.address });

describe("chart pools", () => {
  it("charts a pool by its DexScreener pair, plus the curve a graduated Solana token left", () => {
    expect(chartPools(token("a"))).toEqual({ main: { network: "solana", pool: address("Poola"), token: address("a") }, curve: null });
    const graduate = token("b", { graduated: true, curvePool: address("Curveb") });
    expect(chartPools(graduate).curve).toEqual({ network: "solana", pool: address("Curveb"), token: address("b") });
    const pons = token("c", { chain: "rh", launchpad: "pons", pons: undefined });
    expect(chartPools(pons).main?.network).toBe("robinhood");
    expect(chartPools(token("d", { pool: null }))).toEqual({ main: null, curve: null });
  });
});

describe("chart book", () => {
  it("fetches a newly opened pool's minutes at once and waits for them", async () => {
    const { book, calls } = setup();
    const a = token("a");
    await book.open(a, 2_000);
    expect(calls).toEqual([[a.pool, "minute", 1_000]]);
    expect(book.history(request(a))).toMatchObject({ minuteComplete: true, fetchedAt: NOW, minute: [[T, 1e-5, 1e-5, 1e-5, 1e-5, 10]] });
  });

  it("spends at most 2 calls at once and 5 a minute", async () => {
    const { book, calls, clock } = setup();
    const [a, b, c] = [token("a"), token("b"), token("c")];
    for (const t of [a, b, c]) await book.open(t, 2_000);
    expect(calls.map(([pool]) => pool)).toEqual([a.pool, b.pool]);
    clock.now += 12 * SEC;
    await book.tick();
    await book.tick();
    expect(calls.map(([pool]) => pool)).toEqual([a.pool, b.pool, c.pool]);
  });

  it("refreshes open pools once a minute with only the newest minutes, and stops when nobody looks", async () => {
    const { book, calls, clock } = setup((_, __, limit) => Array.from({ length: Math.min(limit, 3) }, (_, i) => [T + 60 + i * 60, 2e-5, 2e-5, 2e-5, 2e-5, 1] as RawCandle));
    const a = token("a");
    await book.open(a, 2_000);
    clock.now += 70 * SEC;
    await book.tick();
    expect(calls).toHaveLength(1); // nobody asked for it in the last 30 s
    await book.open(a, 2_000);
    await book.tick();
    expect(calls[1]).toEqual([a.pool, "minute", 4]);
    expect(book.history(request(a))?.minute.map(([time]) => time)).toEqual([T + 60, T + 120, T + 180]);
    clock.now += 31 * MIN;
    await book.tick();
    expect(book.history(request(a))).toBeUndefined();
  });

  it("pauses every call for a minute after a rate limit and retries unknown pools later", async () => {
    let limited = true;
    const { book, calls, clock, errors } = setup((r) => {
      if (limited) throw new GeckoRateLimitError();
      return r.pool === address("Poolb") ? null : [[T, 1, 1, 1, 1, 1]];
    });
    const [a, b] = [token("a"), token("b")];
    await book.open(a, 2_000);
    expect(errors).toHaveLength(1);
    limited = false;
    clock.now += 30 * SEC;
    await book.open(a, 2_000);
    expect(calls).toHaveLength(1);
    clock.now += 31 * SEC;
    await book.open(b, 2_000);
    await book.open(a, 2_000);
    expect(calls.map(([pool]) => pool)).toEqual([a.pool, b.pool, a.pool]);
    expect(book.stats()).toMatchObject({ calls: 3, rateLimited: 1, missing: 1 });
    clock.now += 20 * SEC;
    await book.open(b, 2_000);
    expect(calls).toHaveLength(3);
    clock.now += 11 * SEC;
    await book.open(b, 2_000);
    expect(calls.map(([pool]) => pool)).toEqual([a.pool, b.pool, a.pool, b.pool]);
  });

  it("asks for hour candles when the minutes stop short of the pool's first trade", async () => {
    const { book, calls, clock } = setup((_, resolution, limit) => Array.from({ length: limit }, (_, i) => [T + i * 60, 1, 1, 1, 1, 1] as RawCandle));
    const a = token("a", { createdAt: NOW - 20 * 60 * MIN });
    await book.open(a, 2_000);
    clock.now += 12 * SEC;
    await book.tick();
    // 20 hours and 12 seconds since launch, plus two.
    expect(calls).toEqual([[a.pool, "minute", 1_000], [a.pool, "hour", 23]]);
    expect(book.history(request(a))).toMatchObject({ minuteComplete: false, hourComplete: false });
  });

  it("reads a graduated token's curve once, then again after its last trades settle", async () => {
    const { book, calls, clock } = setup();
    const b = token("b", { graduated: true, graduatedAt: NOW, curvePool: address("Curveb") });
    await book.open(b, 2_000);
    await book.tick();
    expect(calls.map(([pool]) => pool)).toEqual([b.pool, address("Curveb")]);
    clock.now += 70 * SEC;
    await book.open(b, 2_000);
    await book.tick();
    expect(calls.map(([pool]) => pool)).toEqual([b.pool, address("Curveb"), b.pool]);
    clock.now += 60 * SEC;
    await book.open(b, 2_000);
    await book.tick();
    await book.tick();
    expect(calls.slice(3).map(([pool]) => pool)).toEqual([address("Curveb"), b.pool]);
    clock.now += 70 * SEC;
    await book.open(b, 2_000);
    await book.tick();
    expect(calls.slice(5).map(([pool]) => pool)).toEqual([b.pool]);
  });
});
