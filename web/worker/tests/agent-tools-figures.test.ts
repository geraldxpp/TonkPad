// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { docsFigures, figureStrings } from "@/shared/tonk/figures";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import { createFigures, FIGURES_CACHE_MS } from "../src/telegram/agent/figures";
import { NOW } from "./fixtures";

const SITE = "https://www.tonkfun.fun";
/** What the deployed launchpad answers on /api/tonk/settings: 0.005 ETH to launch, 1 ETH and 1.073B tokens of virtual reserves. */
const SETTINGS: TonkSettingsJson = {
  chainId: 4663,
  launchFee: "5000000000000000",
  virtualEth: "1000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  paused: false,
  gasPrice: "10000000",
  readAt: NOW - 2_000,
};

type Answer = (signal: AbortSignal | null | undefined) => Promise<Response>;
const json = (body: unknown, status = 200): Answer => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const raw = (body: string): Answer => async () => new Response(body);
const offline: Answer = () => Promise.reject(new TypeError("fetch failed"));
const hang: Answer = (signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

/** A site that gives each answer in turn, then keeps giving the last one. */
function fakeSite(...answers: Answer[]) {
  const urls: string[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    urls.push(String(input));
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (!answer) throw new Error("no answer");
    return answer(init?.signal);
  };
  return { fetchFn, urls };
}

function figuresFor(site: ReturnType<typeof fakeSite>, ethUsd: number | null = null, clock = { now: NOW }) {
  return createFigures({ site: SITE, fetchFn: site.fetchFn, ethUsd: () => ethUsd, now: () => clock.now });
}

function docsStrings(settings: TonkSettingsJson, ethUsd: number | null) {
  const figures = docsFigures(settings);
  if (!figures) throw new Error("no figures");
  return figureStrings(figures, ethUsd, "ETH");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createFigures", () => {
  it("writes the Docs page's own strings for the launchpad's settings, with dollars at the worker's ETH price", async () => {
    const site = fakeSite(json(SETTINGS));
    const figures = await figuresFor(site, 3_000)();
    expect(site.urls).toEqual([`${SITE}/api/tonk/settings`]);
    expect(figures).toEqual({ ...docsStrings(SETTINGS, 3_000), readAt: new Date(NOW - 2_000).toISOString().replace(".000Z", "Z") });
    expect(figures).toMatchObject({
      launchFee: "0.005 ETH",
      startReserves: "1 ETH and 1,073,000,000 tokens, virtual",
      graduation: "After about 2.93 ETH net into the curve",
      paused: false,
      usd: { launchFee: "≈ $15.00", startCap: "≈ $2.8K", graduationCap: "≈ $43.2K" },
    });
  });

  it("has no dollars without a usable ETH price, and reads a pause", async () => {
    for (const price of [null, 0, Number.NaN]) expect((await figuresFor(fakeSite(json(SETTINGS)), price)())?.usd).toBeNull();
    expect(await figuresFor(fakeSite(json({ ...SETTINGS, paused: true })))()).toMatchObject({ paused: true });
  });

  it("is null for an answer that isn't mainnet's settings", async () => {
    const bad = [
      json({ error: "unavailable" }, 502),
      json({ error: "closed" }, 404),
      raw("<html>not json</html>"),
      raw(JSON.stringify({ ...SETTINGS, filler: "x".repeat(5_000) })),
      json({ ...SETTINGS, chainId: 46630 }),
      json({ ...SETTINGS, launchFee: "0.005" }),
      json({ ...SETTINGS, virtualEth: "0" }),
      json({ ...SETTINGS, paused: "no" }),
      json(null),
      offline,
    ];
    for (const answer of bad) expect(await figuresFor(fakeSite(answer))()).toBeNull();
  });

  it("gives up after 5 seconds", async () => {
    vi.useFakeTimers();
    const pending = figuresFor(fakeSite(hang))();
    await vi.advanceTimersByTimeAsync(4_999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
  });

  it("keeps a good answer for 60 seconds, and no failure at all", async () => {
    const clock = { now: NOW };
    const site = fakeSite(offline, json(SETTINGS), json({ ...SETTINGS, launchFee: "7000000000000000" }));
    const figures = figuresFor(site, null, clock);
    expect(await figures()).toBeNull();
    expect((await figures())?.launchFee).toBe("0.005 ETH");
    clock.now += FIGURES_CACHE_MS - 1;
    expect((await figures())?.launchFee).toBe("0.005 ETH");
    expect(site.urls).toHaveLength(2);
    clock.now += 1;
    expect((await figures())?.launchFee).toBe("0.007 ETH");
    expect(site.urls).toHaveLength(3);
  });

  it("shares one read between questions asked at once", async () => {
    const site = fakeSite(json(SETTINGS));
    const figures = figuresFor(site);
    const both = await Promise.all([figures(), figures()]);
    expect(both[0]).toEqual(both[1]);
    expect(site.urls).toHaveLength(1);
  });

  it("dates the figures by the site's read, or by now when the site's time isn't believable", async () => {
    for (const readAt of [0, NOW + 3 * 86_400_000]) {
      expect((await figuresFor(fakeSite(json({ ...SETTINGS, readAt })))())?.readAt).toBe(new Date(NOW).toISOString().replace(".000Z", "Z"));
    }
  });
});
