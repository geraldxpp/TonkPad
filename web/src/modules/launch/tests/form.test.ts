import { describe, expect, it } from "vitest";
import { type CurveSettings, WEI } from "@/shared/tonk/curve";
import { formatEth, formatTokens, parseEthInput } from "@/shared/tonk/format";
import { defaultForm, type LaunchForm, lockSettings, normalize, settleDays } from "../lib/form";
import { issuesIn, validate } from "../lib/validate";
import { launchView } from "../lib/view";

const eth = (text: string) => parseEthInput(text) ?? BigInt(0);
const MAINNET: CurveSettings = { launchFee: eth("0.005"), virtualEth: eth("6"), virtualTokens: BigInt(1_073_000_000) * WEI };
const TESTNET: CurveSettings = { launchFee: eth("0.0001"), virtualEth: eth("0.0015"), virtualTokens: BigInt(1_073_000_000) * WEI };

const filled = (patch: Partial<LaunchForm> = {}): LaunchForm => ({ ...defaultForm(MAINNET), name: "Astro Pup", ticker: "ASTRO", ...patch });
const change = (form: LaunchForm, patch: Partial<LaunchForm>, settings = MAINNET) => {
  const [key] = Object.keys(patch) as (keyof LaunchForm)[];
  return normalize({ ...form, ...patch }, settings, key);
};

describe("the form a creator starts with", () => {
  it("has empty text and the design's settings, with the dev buy sized to the network", () => {
    const form = defaultForm(MAINNET);
    expect(form).toMatchObject({ name: "", ticker: "", devBuy: "0.25", lock: "linear", share: 80, months: 6, crew: 200, creator: 100, agent: false });
    expect(defaultForm(TESTNET).devBuy).toBe("0.0000625");
    expect(lockSettings(form)).toEqual({ type: "linear", sharePct: 80, days: 180 });
    expect(normalize(form, MAINNET)).toEqual({ form, notices: [] });
  });
});

describe("keeping the form inside the launchpad's rules", () => {
  it("shares the 4% reward pool: raising one fee lowers the other to its highest option that fits", () => {
    const base = filled({ crew: 200, creator: 200 });
    expect(change(base, { crew: 300 })).toMatchObject({ form: { crew: 300, creator: 100 }, notices: [{ key: "creatorPool", bps: 100 }] });
    expect(change(base, { creator: 400 })).toMatchObject({ form: { crew: 0, creator: 400 }, notices: [{ key: "crewPool", bps: 0 }] });
    // 2.5% isn't an option, so Crew lands on 2%.
    expect(change(filled({ crew: 300, creator: 100 }), { creator: 150 })).toMatchObject({ form: { crew: 200, creator: 150 } });
    expect(change(base, { crew: 400 }).form).toMatchObject({ crew: 400, creator: 0 });
  });

  it("holds Creator Rewards to the lock's tier as the lock changes", () => {
    const ironclad = filled({ crew: 100, creator: 300 });
    expect(change(ironclad, { share: 75 })).toMatchObject({ form: { creator: 200 }, notices: [{ key: "creatorTier", bps: 200 }] });
    expect(change(ironclad, { months: 2 }).form.creator).toBe(200);
    expect(change(ironclad, { lock: "none" }).form.creator).toBe(50);
    expect(change(filled({ lock: "time", days: 20, creator: 100 }), { days: 29 }).form.creator).toBe(50);
    expect(change(filled({ lock: "time", days: 20, creator: 50 }), { days: 30 }).notices).toEqual([]);
  });

  it("caps Creator Rewards at 0.5% while the lock holds under 1% of supply, as the mainnet contract rules", () => {
    // 0.001 ETH on mainnet's 6 ETH reserve buys about 178,800 tokens: an Ironclad lock of 80% of them is far under 10M.
    const dust = change(filled({ crew: 100, creator: 300 }), { devBuy: "0.001" });
    expect(dust).toMatchObject({ form: { creator: 50 }, notices: [{ key: "creatorTier", bps: 50 }] });
    // 0.1 ETH buys about 17.6M tokens: 80% locked is over 10M, so Ironclad's 4% stays open.
    expect(change(filled({ crew: 0, creator: 400 }), { devBuy: "0.1" }).form.creator).toBe(400);
  });

  it("drops the lock and caps Creator Rewards at 0.5% without a dev buy", () => {
    const { form, notices } = change(filled({ creator: 200 }), { devBuy: "0" });
    expect(form).toMatchObject({ lock: "none", creator: 50 });
    expect(notices.map((notice) => notice.key)).toEqual(["noBuy", "creatorTier"]);
    expect(change(filled(), { devBuy: "" }).form.lock).toBe("none");
  });

  it("caps the dev buy and tidies sliders and options", () => {
    expect(change(filled(), { devBuy: "12" })).toMatchObject({ form: { devBuy: "10" }, notices: [{ key: "devBuyMax" }] });
    expect(change(filled(), { devBuy: "1" }, TESTNET).form.devBuy).toBe("0.0025");
    // Text that isn't an amount is left for the field's own error.
    expect(change(filled(), { devBuy: "abc" }).form.devBuy).toBe("abc");
    expect(normalize(filled({ share: 43, months: 30, days: 3, crew: 120, creator: 75, volume: 7 }), MAINNET).form).toMatchObject({ share: 50, months: 12, days: 3, crew: 100, creator: 50, volume: 100_000 });
    // A custom number of days is left as typed and settled when the field is left.
    expect([settleDays(3), settleDays(120), settleDays(999), settleDays(Number.NaN)]).toEqual([7, 120, 365, 7]);
  });
});

describe("validation", () => {
  it("needs a name and a ticker, and checks the rest only when filled in", () => {
    expect(issuesIn(validate(defaultForm(MAINNET), MAINNET), "all")).toEqual(["name", "ticker"]);
    expect(validate(filled(), MAINNET)).toEqual({});
    const wrong = filled({ name: "x".repeat(33), ticker: "$astro", description: "y".repeat(281), x: "not a handle!", telegram: "astropup", website: "javascript:alert(1)", devBuy: "1.2.3" });
    expect(issuesIn(validate(wrong, MAINNET), "all")).toEqual(["name", "ticker", "description", "x", "telegram", "website", "devBuy"]);
    expect(validate(filled({ ticker: "astro" }), MAINNET)).toEqual({ ticker: true });
    expect(validate(filled({ x: "@astropup", telegram: "t.me/astropup", website: "astropup.fun" }), MAINNET)).toEqual({});
  });

  it("checks the agent only when it is on, and a custom time-lock's days", () => {
    expect(issuesIn(validate(filled({ agent: true }), MAINNET), "all")).toEqual(["agentName", "agentRole", "agentBrief"]);
    expect(issuesIn(validate(filled({ agent: true }), MAINNET), 1)).toEqual([]);
    expect(issuesIn(validate(filled({ agent: true }), MAINNET), 4)).toHaveLength(3);
    expect(validate(filled({ agent: true, agentName: "Commander Astro", agentRole: "Mission commander", agentBrief: "Keep holders informed." }), MAINNET)).toEqual({});
    expect(validate(filled({ lock: "time", days: 6 }), MAINNET)).toEqual({ days: true });
    expect(validate(filled({ lock: "linear", days: 6 }), MAINNET)).toEqual({});
  });
});

describe("the figures on screen", () => {
  it("follow the prompt's mainnet check values", () => {
    const view = launchView(filled(), MAINNET);
    expect(formatEth(view.payNow)).toBe("0.255");
    expect(formatTokens(view.bought)).toBe("42.1M");
    expect(formatTokens(view.locked)).toBe("33.68M");
    expect(formatTokens(view.liquid)).toBe("8.42M");
    expect(view.supplyPct.toFixed(2)).toBe("4.21");
    expect(view.curvePct.toFixed(2)).toBe("5.26");
    expect(formatEth(view.startCap)).toBe("5.5918");
    expect(formatEth(view.afterCap)).toBe("6.0578");
    expect(formatEth(view.target)).toBe("17.5824");
    expect(view).toMatchObject({ tier: "ironclad", creatorMax: 400, totalBps: 400, locks: true, crewDaily: 2_000, creatorDaily: 1_000, protocolDaily: 1_000, holderDaily: 20 });
    expect([view.score.now, view.score.later, view.score.lockedBadge]).toEqual([70, 80, true]);
  });

  it("follow the testnet's own settings, and show an unlocked buy for what it is", () => {
    const test = launchView({ ...filled(), devBuy: "0.0002" }, TESTNET);
    expect(formatEth(test.payNow)).toBe("0.0003");
    expect(formatTokens(test.bought)).toBe("124M");
    expect(formatEth(test.startCap)).toBe("0.001398");
    expect(formatEth(test.target)).toBe("0.004396");
    const unlocked = launchView(filled({ lock: "none", creator: 50 }), MAINNET);
    expect(unlocked).toMatchObject({ locks: false, tier: "none", creatorMax: 50 });
    expect(unlocked.locked).toBe(BigInt(0));
    expect([unlocked.score.now, unlocked.score.later, unlocked.score.lockedBadge]).toEqual([60, 70, false]);
    // A typed amount that isn't valid yet counts as no buy, rather than breaking the preview.
    expect(launchView(filled({ devBuy: "abc" }), MAINNET).hasBuy).toBe(false);
  });
});
