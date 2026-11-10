// @vitest-environment node
// The engine runs on the server; web3.js needs Node's own Uint8Array, not jsdom's.
import { PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { amountText, formatCompact, formatFull, formatUsdValue, parseAmount, presetAmount, unitRate } from "@/shared/swap/amounts";
import { quoteView } from "@/shared/swap/display";
import { swapConfig } from "@/shared/swap/server/config";
import type { JupBuild } from "@/shared/swap/server/jupiter";
import { parseSwapRequest } from "@/shared/swap/server/request";
import { assembleSolanaTransaction, associatedAccount, feeSide, networkFee } from "@/shared/swap/server/solana-tx";
import { decodeAbiString } from "@/shared/swap/server/token-info";
import { evmFeeToken } from "@/shared/swap/server/zeroex";
import { BASE_TOKENS, NATIVE_EVM, SOL_MINT, USDC_MINT, USDG } from "@/shared/swap/tokens";
import { approveData } from "@/shared/swap/useSwapRun";
import type { SwapQuote } from "@/shared/types/swap";

const TAKER = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const FEE_WALLET = "11111111111111111111111111111112";

describe("amounts", () => {
  it("parses typed amounts into base units, and refuses nothing to trade", () => {
    expect(parseAmount("0.05", 9)).toBe("50000000");
    expect(parseAmount("1,5", 6)).toBe("1500000");
    expect(parseAmount(".5", 6)).toBe("500000");
    expect(parseAmount("1.23456789", 6)).toBe("1234567");
    expect(parseAmount("0", 9)).toBeNull();
    expect(parseAmount("abc", 9)).toBeNull();
    expect(parseAmount("1.2.3", 9)).toBeNull();
  });

  it("formats amounts for the boxes and tight spots", () => {
    expect(amountText("1234567890", 9)).toBe("1.234567");
    expect(formatFull({ raw: "2857989690000", decimals: 6 })).toBe("2,857,989.69");
    expect(formatFull({ raw: "58200", decimals: 9 })).toBe("0.0000582");
    expect(formatCompact({ raw: "2857989690000", decimals: 6 })).toBe("2.86M");
    expect(formatUsdValue(170.6)).toBe("$170.60");
    expect(formatUsdValue(0.004)).toBe("<$0.01");
    expect(formatUsdValue(null)).toBeNull();
  });

  it("takes balance presets, keeping the fee reserve back on Max", () => {
    expect(presetAmount("1000000000", 25)).toBe("250000000");
    expect(presetAmount("1000000000", 100, BigInt(10_000_000))).toBe("990000000");
    expect(presetAmount("5000000", 100, BigInt(10_000_000))).toBeNull();
  });

  it("works out one whole input in output units", () => {
    expect(unitRate({ raw: "100000000", decimals: 9 }, { raw: "8595501", decimals: 6 })).toEqual({ raw: "85955010", decimals: 6 });
  });
});

describe("requests and config", () => {
  const base = { chain: "sol", from: SOL_MINT, to: USDC_MINT, amount: "100000000", slippageBps: "100" };

  it("accepts a well-formed swap and keeps the taker optional", () => {
    expect(parseSwapRequest(base)).toEqual({ chain: "sol", from: SOL_MINT, to: USDC_MINT, amount: "100000000", slippageBps: 100, taker: null });
    expect(parseSwapRequest({ ...base, taker: TAKER }).taker).toBe(TAKER);
  });

  it.each([
    [{ chain: "eth" }],
    [{ to: SOL_MINT }],
    [{ to: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" }],
    [{ amount: "0" }],
    [{ amount: "1.5" }],
    [{ slippageBps: "5000" }],
    [{ taker: "not-a-wallet" }],
  ])("refuses %o", (patch) => {
    expect(() => parseSwapRequest({ ...base, ...patch })).toThrow();
  });

  it("only treats well-formed fee wallets as set, and opens trading only on SWAP_TRADING=on", () => {
    const config = swapConfig({ SOLANA_FEE_WALLET: "nope", EVM_FEE_WALLET: "0x0000000000000000000000000000000000000001", SWAP_TRADING: "yes" });
    expect(config.solanaFeeWallet).toBeNull();
    expect(config.evmFeeWallet).toBe("0x0000000000000000000000000000000000000001");
    expect(config.tradingOpen).toBe(false);
    expect(swapConfig({ SWAP_TRADING: "on" }).tradingOpen).toBe(true);
    expect(config.feeBps).toBe(100);
  });
});

describe("fees", () => {
  it("takes the Solana fee from the SOL or USDC side, input first", () => {
    expect(feeSide(SOL_MINT, "Bonk")).toEqual({ side: "in", mint: SOL_MINT });
    expect(feeSide("Bonk", SOL_MINT)).toEqual({ side: "out", mint: SOL_MINT });
    expect(feeSide("Bonk", USDC_MINT)).toEqual({ side: "out", mint: USDC_MINT });
    expect(feeSide("Bonk", "Wif")).toBeNull();
  });

  it("takes the Robinhood Chain fee in ETH, then WETH or USDG, else what's bought", () => {
    expect(evmFeeToken("0xabc", NATIVE_EVM)).toBe(NATIVE_EVM);
    expect(evmFeeToken(USDG, "0xabc")).toBe(USDG);
    expect(evmFeeToken("0xaaa", "0xbbb")).toBe("0xbbb");
  });

  it("encodes an ERC-20 approval and decodes token names", () => {
    expect(approveData("0x0000000000001ff3684f28c67538d4d072c22734", "255")).toBe(
      "0x095ea7b30000000000000000000000000000000000001ff3684f28c67538d4d072c2273400000000000000000000000000000000000000000000000000000000000000ff",
    );
    const hex = `0x${"20".padStart(64, "0")}${"7".padStart(64, "0")}${Buffer.from("SUNFIRE").toString("hex").padEnd(64, "0")}`;
    expect(decodeAbiString(hex)).toBe("SUNFIRE");
    expect(decodeAbiString(`0x${Buffer.from("MKR").toString("hex").padEnd(64, "0")}`)).toBe("MKR");
  });
});

/** A small Jupiter build: compute budget (limit 200k, price 1000 µlamports), one swap instruction, no tables. */
function build(): JupBuild {
  const limit = Buffer.alloc(5);
  limit.writeUInt8(2, 0);
  limit.writeUInt32LE(200_000, 1);
  const price = Buffer.alloc(9);
  price.writeUInt8(3, 0);
  price.writeBigUInt64LE(BigInt(1_000), 1);
  const budget = (data: Buffer) => ({ programId: "ComputeBudget111111111111111111111111111111", accounts: [], data: data.toString("base64") });
  return {
    inAmount: "99000000",
    outAmount: "8500000",
    otherAmountThreshold: "8415000",
    slippageBps: 100,
    priceImpactPct: 0,
    labels: ["Raydium"],
    computeBudgetInstructions: [budget(limit), budget(price)],
    setupInstructions: [],
    swapInstruction: { programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", accounts: [{ pubkey: TAKER, isSigner: true, isWritable: true }], data: "AQ==" },
    cleanupInstruction: null,
    otherInstructions: [],
    tipInstruction: null,
    lookupTables: {},
    blockhash: Array.from({ length: 32 }, (_, i) => i + 1),
    lastValidBlockHeight: 1,
  };
}

describe("Solana transaction", () => {
  it("puts an input-side SOL fee before the route and adds compute for it", () => {
    const base64 = assembleSolanaTransaction(build(), TAKER, { side: "in", mint: SOL_MINT, amount: BigInt(1_000_000), wallet: FEE_WALLET });
    const tx = VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
    const keys = tx.message.staticAccountKeys.map((key) => key.toBase58());
    const programs = tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]);
    expect(programs).toEqual(["ComputeBudget111111111111111111111111111111", "ComputeBudget111111111111111111111111111111", SystemProgram.programId.toBase58(), "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"]);
    expect(Buffer.from(tx.message.compiledInstructions[0].data).readUInt32LE(1)).toBe(220_000);
    expect(keys[0]).toBe(TAKER);
  });

  it("puts an output-side fee after the route, and leaves the build alone without one", () => {
    const withFee = VersionedTransaction.deserialize(Buffer.from(assembleSolanaTransaction(build(), TAKER, { side: "out", mint: SOL_MINT, amount: BigInt(900_000), wallet: FEE_WALLET }), "base64"));
    const keys = withFee.message.staticAccountKeys.map((key) => key.toBase58());
    expect(keys[withFee.message.compiledInstructions.at(-1)!.programIdIndex]).toBe(SystemProgram.programId.toBase58());
    const plain = VersionedTransaction.deserialize(Buffer.from(assembleSolanaTransaction(build(), TAKER, null), "base64"));
    expect(plain.message.compiledInstructions).toHaveLength(3);
    expect(Buffer.from(plain.message.compiledInstructions[0].data).readUInt32LE(1)).toBe(200_000);
  });

  it("refuses a transaction past Solana's 1,232-byte limit", () => {
    const big = build();
    big.swapInstruction = {
      ...big.swapInstruction,
      accounts: Array.from({ length: 40 }, () => ({ pubkey: PublicKey.unique().toBase58(), isSigner: false, isWritable: true })),
    };
    expect(() => assembleSolanaTransaction(big, TAKER, null)).toThrow(/too large/);
  });

  it("counts the network cost: a signature plus the priority fee", () => {
    expect(networkFee(build())).toBe(BigInt(5_000 + 200));
  });

  it("derives a wallet's associated USDC account", () => {
    expect(associatedAccount(TAKER, USDC_MINT).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  });
});

describe("quote display", () => {
  it("shows the amounts, rate, fee in the coin and route", () => {
    const [eth, usdg] = BASE_TOKENS.rh;
    const quote: SwapQuote = {
      chain: "rh", provider: "0x", inToken: eth.address, outToken: usdg.address, inAmount: "10000000000000000", outAmount: "21000000", minOut: "20790000",
      slippageBps: 100, priceImpact: null, fee: { bps: 100, amount: "100000000000000", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
      networkFee: "8262186174000", inUsd: 21.14, outUsd: 21, route: ["Uniswap V4"], tradingOpen: true, quotedAt: 1,
    };
    const view = quoteView(quote, eth, usdg);
    expect(view.out).toBe("21");
    expect(view.rate).toBe("2,100");
    expect(view.fee).toEqual({ pct: "1%", amount: "0.0001 ETH" });
    expect(view.network).toBe("0.000008262 ETH");
    expect(view.route).toBe("Uniswap V4");
    expect(view.inUsd).toBe("$21.14");
  });
});
