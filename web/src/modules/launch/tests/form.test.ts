import { describe, expect, it } from "vitest";
import { type CurveSettings, WEI } from "@/shared/tonk/curve";
import { formatEth, formatTokens, parseEthInput } from "@/shared/tonk/format";
import { defaultForm, effective, type LaunchForm, lockSettings, normalize, settleDays } from "../lib/form";
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
/** What the launch gets from a form's choices. */
const held = (form: LaunchForm, settings = MAINNET) => effective(form, settings);

describe("the form a creator starts with", () => {
  it("has empty text and the design's settings, with the dev buy sized to the network", () => {
    const form = defaultForm(MAINNET);
    expect(form).toMatchObject({ name: "", ticker: "", devBuy: "0.25", lock: "linear", share: 80, months: 6, crew: 200, creator: 100, agent: false });
    expect(defaultForm(TESTNET).devBuy).toBe("0.00006");
    expect(lockSettings(form)).toEqual({ type: "linear", sharePct: 80, days: 180 });
    expect(normalize(form, MAINNET)).toEqual({ form, notices: [] });
  });
});

describe("keeping the form inside the launchpad's rules", () => {
  it("shares the 4% reward pool: a Creator choice lowers Crew, and raising Crew holds Creator back without losing it", () => {
    const base = filled({ crew: 200, creator: 200 });
    const crewUp = change(base, { crew: 300 });
    expect(crewUp).toMatchObject({ form: { crew: 300, creator: 200 }, notices: [] });
    expect(held(crewUp.form)).toMatchObject({ creator: 100, notices: [{ key: "creatorPool", bps: 100 }] });
    expect(held(change(crewUp.form, { crew: 200 }).form)).toMatchObject({ creator: 200, notices: [] });
    expect(change(base, { creator: 400 })).toMatchObject({ form: { crew: 0, creator: 400 }, notices: [{ key: "crewPool", bps: 0 }] });
    // 2.5% isn't an option, so Crew lands on 2%.
    expect(change(filled({ crew: 300, creator: 100 }), { creator: 150 })).toMatchObject({ form: { crew: 200, creator: 150 } });
    expect(held(change(base, { crew: 400 }).form)).toMatchObject({ creator: 0, notices: [{ key: "creatorPool", bps: 0 }] });
  });

  it("judges each Creator option by the tokens its own fee buys, so options the lock can't honour near the 10M floor are closed", () => {
    // 0.0735 ETH on the 6 ETH reserve: 80% of what a 2% fee buys is over 10M tokens, but not at 3% or 4%.
    const near = filled({ devBuy: "0.0735", crew: 0, creator: 400 });
    expect(held(near)).toMatchObject({ creatorMax: 200, creator: 200, notices: [{ key: "creatorTier", bps: 200 }] });
    expect(launchView(near, MAINNET)).toMatchObject({ creatorMax: 200, creator: 200 });
  });

  it("holds Creator Rewards to the lock's tier as the lock changes, keeping the creator's choice", () => {
    const ironclad = filled({ crew: 100, creator: 300 });
    const lower = change(ironclad, { share: 75 }).form;
    expect(lower.creator).toBe(300);
    expect(held(lower)).toEqual({ lock: "linear", creator: 200, creatorMax: 200, notices: [{ key: "creatorTier", bps: 200 }] });
    expect(held(change(ironclad, { months: 2 }).form).creator).toBe(200);
    expect(held(change(ironclad, { lock: "none" }).form).creator).toBe(50);
    expect(held(change(filled({ lock: "time", days: 20, creator: 100 }), { days: 29 }).form).creator).toBe(50);
    expect(held(change(filled({ lock: "time", days: 20, creator: 50 }), { days: 30 }).form).notices).toEqual([]);
    // Back at Ironclad, the creator's 3% applies again: nothing was lost on the way.
    expect(held(change(lower, { share: 80 }).form)).toEqual({ lock: "linear", creator: 300, creatorMax: 400, notices: [] });
  });

  it("holds Creator Rewards at 0.5% while the lock holds under 1% of supply, as the mainnet contract rules", () => {
    // 0.001 ETH on mainnet's 6 ETH reserve buys about 178,800 tokens: an Ironclad lock of 80% of them is far under 10M.
    const dust = change(filled({ crew: 100, creator: 300 }), { devBuy: "0.001" }).form;
    expect(held(dust)).toMatchObject({ creator: 50, notices: [{ key: "creatorTier", bps: 50 }] });
    // 0.1 ETH buys about 17.6M tokens: 80% locked is over 10M, so Ironclad's 4% stays open.
    expect(held(change(filled({ crew: 0, creator: 400 }), { devBuy: "0.1" }).form).creator).toBe(400);
  });

  it("gives no lock and holds Creator Rewards at 0.5% without a dev buy, keeping both choices for when one is typed", () => {
    const empty = change(filled({ creator: 200 }), { devBuy: "0" });
    expect(empty).toMatchObject({ form: { lock: "linear", creator: 200 }, notices: [] });
    expect(held(empty.form)).toEqual({ lock: "none", creator: 50, creatorMax: 50, notices: [{ key: "noBuy" }, { key: "creatorTier", bps: 50 }] });
    expect(held(change(filled(), { devBuy: "" }).form).lock).toBe("none");
    // "0.05" typed after "0": the lock and 2% were never undone.
    expect(held(change(empty.form, { devBuy: "0.5" }).form)).toEqual({ lock: "linear", creator: 200, creatorMax: 400, notices: [] });
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
    // Without a dev buy there is no lock, so its length doesn't matter.
    expect(validate(filled({ lock: "time", days: 6, devBuy: "0" }), MAINNET)).toEqual({});
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

  it("say when a lock reaches a tier by share and length but holds under 10M tokens, and what dev buy opens it", () => {
    const LIVE: CurveSettings = { ...MAINNET, virtualEth: eth("1") };
    // Seen on mainnet: 0.0031 ETH with 80% time-locked for 30 days locks 2.61M tokens, so no tier.
    const small = launchView(filled({ devBuy: "0.0031", lock: "time", days: 30, share: 80, crew: 200, creator: 100 }), LIVE);
    expect(formatTokens(small.locked)).toBe("2.61M");
    expect(small).toMatchObject({ tier: "none", creator: 50, floor: { amount: eth("0.015"), pct: 200 } });
    // 0.015 ETH is enough: the tier opens and the creator's 1% applies.
    const enough = launchView(filled({ devBuy: "0.015", lock: "time", days: 30, share: 80, crew: 200, creator: 100 }), LIVE);
    expect(enough).toMatchObject({ tier: "standard", creator: 100, floor: null });
    // A lock too short or too small by share says the usual thing instead; so does a pool Crew already fills.
    expect(launchView(filled({ devBuy: "0.0031", lock: "time", days: 20 }), LIVE).floor).toBeNull();
    expect(launchView(filled({ devBuy: "0.0031", lock: "time", days: 30, crew: 400, creator: 0 }), LIVE).floor).toBeNull();
  });

  it("follow the testnet's own settings, and show an unlocked buy for what it is", () => {
    const test = launchView({ ...filled(), devBuy: "0.0002" }, TESTNET);
    expect(formatEth(test.payNow)).toBe("0.0003");
    expect(formatTokens(test.bought)).toBe("124M");
    expect(formatEth(test.startCap)).toBe("0.001398");
    expect(formatEth(test.target)).toBe("0.004396");
    const unlocked = launchView(filled({ lock: "none", creator: 50 }), MAINNET);
    expect(unlocked).toMatchObject({ locks: false, tier: "none", creatorMax: 50, lockType: "none", creator: 50 });
    // The figures and the request use what the launch gets: a creator's 2% held at 0.5% counts as 0.5%.
    const holding = launchView(filled({ devBuy: "0", creator: 200 }), MAINNET);
    expect(holding).toMatchObject({ lockType: "none", locks: false, creator: 50, totalBps: 350 });
    expect(unlocked.locked).toBe(BigInt(0));
    expect([unlocked.score.now, unlocked.score.later, unlocked.score.lockedBadge]).toEqual([60, 70, false]);
    // A typed amount that isn't valid yet counts as no buy, rather than breaking the preview.
    expect(launchView(filled({ devBuy: "abc" }), MAINNET).hasBuy).toBe(false);
  });
});
