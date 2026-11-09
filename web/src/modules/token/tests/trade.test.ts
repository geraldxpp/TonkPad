import { describe, expect, it } from "vitest";
import { LANDS, sendAmount, sourcesFor } from "../lib/bridge";
import { formatTokens, quoteTrade, SIM_WALLET } from "../lib/trade";

const GHOST = { priceUsd: 0.0000582, nativeUsd: 3_412, holdingM: SIM_WALLET.tokensM };

describe("quoteTrade", () => {
  it("buys 2.93M GHOST for 0.05 ETH, at least 2.49M after 15% slippage", () => {
    const quote = quoteTrade({ ...GHOST, side: "buy", amount: "0.05", balance: 0.25 });
    expect(formatTokens(quote.receive)).toBe("2.93M");
    expect(formatTokens(quote.minimum)).toBe("2.49M");
    expect(quote.payUsd).toBeCloseTo(170.6);
    expect(quote.blocked).toBeNull();
    expect(quote.needsFunds).toBe(false);
  });

  it("needs funds, and says so, while the wallet holds less than the amount", () => {
    const empty = quoteTrade({ ...GHOST, side: "buy", amount: "0.05", balance: 0 });
    expect(empty.blocked).toBe("short");
    expect(empty.needsFunds).toBe(true);
    const short = quoteTrade({ ...GHOST, side: "buy", amount: "0.5", balance: 0.25 });
    expect(short.blocked).toBe("short");
    expect(short.needsFunds).toBe(true);
  });

  it("sells millions of tokens for the chain's coin", () => {
    const quote = quoteTrade({ ...GHOST, side: "sell", amount: "1", balance: 0 });
    expect(quote.receive.toFixed(4)).toBe("0.0171");
    expect(quote.minimum.toFixed(4)).toBe("0.0145");
    expect(quote.payUsd).toBeCloseTo(58.2);
    expect(quote.needsFunds).toBe(false);
    expect(quoteTrade({ ...GHOST, side: "sell", amount: "3.13", balance: 0 }).blocked).toBeNull();
    expect(quoteTrade({ ...GHOST, side: "sell", amount: "4", balance: 0 }).blocked).toBe("shortToken");
  });

  it("asks for an amount when there's none", () => {
    for (const amount of ["", "0", "-1", "abc"]) {
      expect(quoteTrade({ ...GHOST, side: "buy", amount, balance: 1 }).blocked).toBe("enter");
    }
  });
});

describe("formatTokens", () => {
  it("writes token amounts the export's way", () => {
    expect(formatTokens(2_931_271)).toBe("2.93M");
    expect(formatTokens(784_000)).toBe("784.0K");
    expect(formatTokens(512)).toBe("512");
  });
});

describe("bridge quotes", () => {
  it("match the export for 0.25 ETH on Robinhood Chain", () => {
    expect(LANDS.rh).toBe(0.25);
    expect(sendAmount("base", "rh", 3_412)).toBe("853.40 USDC");
    expect(sendAmount("arb", "rh", 3_412)).toBe("853.40 USDC");
    expect(sendAmount("eth", "rh", 3_412)).toBe("0.2512 ETH");
    expect(sendAmount("sol", "rh", 3_412)).toBe("4.68 SOL");
  });

  it("offer the three EVM chains and the app's other chain", () => {
    expect(sourcesFor("rh")).toEqual(["base", "arb", "eth", "sol"]);
    expect(sourcesFor("sol")).toEqual(["base", "arb", "eth", "rh"]);
  });
});
