import { describe, expect, it } from "vitest";
import { isChainAddress, isEvmAddress, isSolanaAddress, sameAddress, shortAddress } from "@/shared/lib/address";
import { floorUnits, formatBalance, isRawAmount, toUnits } from "@/shared/wallet/units";

describe("addresses", () => {
  it("accepts only 32-byte base58 Solana keys", () => {
    expect(isSolanaAddress("So11111111111111111111111111111111111111112")).toBe(true);
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true);
    expect(isSolanaAddress("FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv")).toBe(true);
    // 0, O, I and l aren't base58; 31 bytes is too short.
    expect(isSolanaAddress("0LRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv")).toBe(false);
    expect(isSolanaAddress("1111111111111111111111111111111")).toBe(false);
    expect(isSolanaAddress("0x7a5e00000000000000000000000000000000c0de")).toBe(false);
  });

  it("accepts one 20-byte EVM address in any case", () => {
    expect(isEvmAddress("0x7a5e00000000000000000000000000000000c0de")).toBe(true);
    expect(isEvmAddress("0x7A5E00000000000000000000000000000000C0DE")).toBe(true);
    expect(isEvmAddress("0x7a5e00000000000000000000000000000000c0d")).toBe(false);
    expect(isEvmAddress("7a5e00000000000000000000000000000000c0de00")).toBe(false);
    expect(isEvmAddress("0x7a5e00000000000000000000000000000000c0de?x=1")).toBe(false);
  });

  it("checks an address against its chain's format", () => {
    expect(isChainAddress("sol", "So11111111111111111111111111111111111111112")).toBe(true);
    expect(isChainAddress("rh", "So11111111111111111111111111111111111111112")).toBe(false);
    expect(isChainAddress("rh", "0x7a5e00000000000000000000000000000000c0de")).toBe(true);
    expect(isChainAddress("sol", "0x7a5e00000000000000000000000000000000c0de")).toBe(false);
  });

  it("shortens and compares addresses the app's way", () => {
    expect(shortAddress("FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv")).toBe("FLRe…SuCv");
    expect(shortAddress("0x7a5e00000000000000000000000000000000c0de")).toBe("0x7a5e…c0de");
    expect(sameAddress("0xABC0000000000000000000000000000000000def", "0xabc0000000000000000000000000000000000DEF")).toBe(true);
    expect(sameAddress("so11111111111111111111111111111111111111112", "So11111111111111111111111111111111111111112")).toBe(false);
  });
});

describe("amounts", () => {
  it("validates raw amounts", () => {
    expect(isRawAmount({ raw: "0", decimals: 9 })).toBe(true);
    expect(isRawAmount({ raw: "123456789012345678901234567890", decimals: 18 })).toBe(true);
    expect(isRawAmount({ raw: "-1", decimals: 9 })).toBe(false);
    expect(isRawAmount({ raw: "1.5", decimals: 9 })).toBe(false);
    expect(isRawAmount({ raw: "1", decimals: 37 })).toBe(false);
    expect(isRawAmount({ raw: 1, decimals: 9 })).toBe(false);
    expect(isRawAmount(null)).toBe(false);
  });

  it("converts base units to whole units", () => {
    expect(toUnits({ raw: "1500000000", decimals: 9 })).toBe(1.5);
    expect(toUnits({ raw: "250000000000000000", decimals: 18 })).toBe(0.25);
    expect(toUnits({ raw: "3130000000000", decimals: 6 })).toBe(3_130_000);
    expect(toUnits({ raw: "42", decimals: 0 })).toBe(42);
  });

  it("cuts to four decimals without ever rounding up", () => {
    expect(floorUnits({ raw: "1234567890", decimals: 9 })).toBe("1.2345");
    expect(floorUnits({ raw: "1000100000", decimals: 9 })).toBe("1.0001");
    expect(floorUnits({ raw: "999999999", decimals: 9 })).toBe("0.9999");
    expect(floorUnits({ raw: "2000000000", decimals: 9 })).toBe("2");
    // Millions of tokens for the sell side's Max: 3,129,999.99 tokens → 3.1299M.
    expect(floorUnits({ raw: "3129999990000", decimals: 6 }, 6)).toBe("3.1299");
  });

  it("formats balances for the trade panel", () => {
    expect(formatBalance({ raw: "0", decimals: 9 })).toBe("0");
    expect(formatBalance({ raw: "50000", decimals: 9 })).toBe("<0.0001");
    expect(formatBalance({ raw: "1234567890", decimals: 9 })).toBe("1.2345");
    expect(formatBalance({ raw: "250000000000000000", decimals: 18 })).toBe("0.25");
    expect(formatBalance({ raw: "12480500000000", decimals: 9 })).toBe("12,480.5");
  });
});
