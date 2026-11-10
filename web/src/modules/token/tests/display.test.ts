import { describe, expect, it } from "vitest";
import { padLabel, safeUrl, top10Band, venueOf, walletDot } from "../lib/display";
import { formatNative, formatSigned, shortAddress } from "../lib/format";

describe("display helpers", () => {
  it("keeps only plain http(s) links from token metadata", () => {
    expect(safeUrl("https://ghosty.example")).toBe("https://ghosty.example/");
    expect(safeUrl("http://x.example/a")).toBe("http://x.example/a");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it("gives a wallet the same dot every time", () => {
    expect(walletDot("0x7f3a…e8d1")).toBe(walletDot("0x7f3a…e8d1"));
    expect(walletDot("0x7f3a…e8d1")).toMatch(/^linear-gradient/);
  });

  it("names tonkfun.fun launches as native and routes trades to the right venue", () => {
    expect(padLabel("tonk", "{name} Native")).toBe("tonkfun.fun Native");
    expect(padLabel("pump", "{name} Native")).toBe("Pump.fun");
    expect(venueOf({ launchpad: "tonk", chain: "rh", onCurve: true }, "{pad} curve")).toBe("tonkfun.fun curve");
    expect(venueOf({ launchpad: "pump", chain: "sol", onCurve: false }, "{pad} curve")).toBe("Jupiter");
    expect(venueOf({ launchpad: "tonk", chain: "rh", onCurve: false }, "{pad} curve")).toBe("Uniswap");
  });

  it("formats addresses, coin balances and signed counts", () => {
    expect(shortAddress("0x5e1d7c4b92a03f6e18d5b7c2a94e6f01d3c8a0f3")).toBe("0x5e1d…a0f3");
    expect(shortAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("7xKX…gAsU");
    expect(formatNative(8.4)).toBe("8.4");
    expect(formatNative(0.35)).toBe("0.35");
    expect(formatNative(1_240)).toBe("1,240");
    expect(formatSigned(96)).toBe("+96");
    expect(formatSigned(-12)).toBe("−12");
  });

  it("bands the top-10 share like the Mission score", () => {
    expect(top10Band(0.182).label).toBe("healthy");
    expect(top10Band(0.25).label).toBe("spread");
    expect(top10Band(0.35)).toEqual({ label: "concentrated", tone: "text-warn" });
    expect(top10Band(0.6)).toEqual({ label: "concentrated", tone: "text-neg" });
  });
});
