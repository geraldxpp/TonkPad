import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { CURVE_SUPPLY, TOTAL_SUPPLY } from "@/shared/tonk/curve";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import { DEMO_SETTINGS, getDocsData } from "../data/get-docs-data";
import { mainnetContracts, MAINNET_RECORD } from "../lib/contracts";
import { figureText } from "../lib/figure-text";
import { docsFigures, usdValue } from "../lib/figures";
import type { DocsLiveValue } from "../lib/live";

const f = en.docs.figures;
const ETH = BigInt(10) ** BigInt(18);
const settings = (overrides: Partial<TonkSettingsJson> = {}): TonkSettingsJson => ({ ...DEMO_SETTINGS, ...overrides });
const live = (overrides: Partial<DocsLiveValue> = {}): DocsLiveValue => ({ figures: docsFigures(DEMO_SETTINGS), pending: false, source: "live", chainName: "Robinhood Chain", unit: "ETH", usd: "off", ...overrides });

describe("docsFigures", () => {
  it("works out the starting cap and the graduation point as the contract does, to the wei", () => {
    const figures = docsFigures(settings());
    if (!figures) throw new Error("no figures");
    const virtualEth = ETH;
    const virtualTokens = BigInt(1_073_000_000) * ETH;
    // _computeBuyQuote: the virtual ETH at graduation, rounded up, less the starting reserve.
    const atGraduation = (virtualEth * virtualTokens + (virtualTokens - CURVE_SUPPLY) - BigInt(1)) / (virtualTokens - CURVE_SUPPLY);
    expect(figures.launchFee).toBe(BigInt(5) * BigInt(10) ** BigInt(15));
    expect(figures.startCap).toBe((virtualEth * TOTAL_SUPPLY) / virtualTokens);
    expect(figures.target).toBe(atGraduation - virtualEth);
    expect(figures.graduationCap).toBe((atGraduation * TOTAL_SUPPLY) / (virtualTokens - CURVE_SUPPLY));
    // About 2.93 ETH into a curve with the 1 ETH reserve, as the guarded launch planned.
    expect(Number(figures.target) / 1e18).toBeCloseTo(2.9304, 4);
    expect(figures.paused).toBe(false);
  });

  it("refuses settings no curve could run on", () => {
    expect(docsFigures(settings({ virtualEth: "0" }))).toBeNull();
    expect(docsFigures(settings({ virtualTokens: String(CURVE_SUPPLY) }))).toBeNull();
    expect(docsFigures(settings({ launchFee: "-1" }))).toBeNull();
    expect(docsFigures(settings({ virtualEth: "1e18" }))).toBeNull();
  });
});

describe("usdValue", () => {
  it("counts dollars only at a real price", () => {
    expect(usdValue(ETH, 3000)).toBe(3000);
    expect(usdValue(ETH, null)).toBeNull();
    expect(usdValue(ETH, 0)).toBeNull();
    expect(usdValue(ETH, Number.NaN)).toBeNull();
  });
});

describe("figureText", () => {
  it("says the figure is being read, then unavailable, and never makes one up", () => {
    expect(figureText("fee", live({ figures: null, pending: true }), f)).toMatchObject({ value: "Reading the launchpad…", usd: null, detail: null });
    expect(figureText("fee", live({ figures: null }), f)).toMatchObject({ value: "Unavailable right now", usd: null });
  });

  it("adds dollars at the live ETH price on mainnet, or says there are none", () => {
    expect(figureText("fee", live(), f).usd).toBeNull();
    expect(figureText("fee", live({ usd: "pending" }), f).usd).toBeNull();
    expect(figureText("fee", live({ usd: "unavailable" }), f).usd).toBe("Dollar value unavailable");
    expect(figureText("fee", live({ usd: 3000 }), f)).toMatchObject({ value: "0.005 ETH", usd: "≈ $15.00" });
    expect(figureText("startCap", live({ usd: 3000 }), f)).toMatchObject({ value: "0.93 ETH", usd: "≈ $2.8K" });
    expect(figureText("graduation", live({ usd: 3000 }), f)).toMatchObject({ value: "After about 2.93 ETH net into the curve", detail: "At a market cap of about 14.4 ETH", usd: "≈ $43.2K" });
  });

  it("counts in the site's own unit, and reads the paused state", () => {
    expect(figureText("reserveNow", live({ unit: "test ETH" }), f).value).toBe("1 test ETH");
    expect(figureText("maxCurve", live(), f).value).toBe("About 2.93 ETH");
    expect(figureText("status", live({ figures: docsFigures(settings({ paused: true })) }), f).value).toBe(f.paused);
  });
});

describe("mainnetContracts", () => {
  it("lists the deployment record's five addresses, well formed and distinct", () => {
    const contracts = mainnetContracts();
    expect(contracts.map((contract) => contract.id)).toEqual(["launchpad", "migrator", "guard", "tokenFactory", "safe"]);
    for (const contract of contracts) expect(contract.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(new Set(contracts.map((contract) => contract.address.toLowerCase())).size).toBe(5);
    expect(contracts[0].url).toBe(`https://robinhoodchain.blockscout.com/address/${MAINNET_RECORD.launchpad}?tab=contract`);
    expect(contracts[4].url).toBe(`https://robinhoodchain.blockscout.com/address/${MAINNET_RECORD.safe}`);
  });

  it("names a guard whose address enables only beforeInitialize, as the guard's constructor requires", () => {
    const flags = BigInt(MAINNET_RECORD.guard) & BigInt((1 << 14) - 1);
    expect(flags).toBe(BigInt(1 << 13));
  });
});

describe("getDocsData", () => {
  it("reads live where a launchpad is connected, shows the demo in mock mode, and nothing otherwise", async () => {
    expect(await getDocsData("testnet")).toMatchObject({ source: "live", chainName: "Robinhood Chain Testnet", unit: "test ETH", settings: null });
    expect(await getDocsData("mock")).toMatchObject({ source: "demo", chainName: null, unit: "ETH", settings: DEMO_SETTINGS });
    // Mainnet before its deployment values are set connects nothing, as Launch does.
    expect(await getDocsData("mainnet")).toMatchObject({ source: "none", settings: null });
    expect(await getDocsData("off")).toMatchObject({ source: "none", settings: null, inviteOnly: false });
  });
});
