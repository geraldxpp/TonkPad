import { describe, expect, it } from "vitest";
import { chainFeeCap, type ChainRead, wantsFeeCap } from "@/shared/wallet/fees";

const block = (baseFeePerGas: unknown): ChainRead => async ({ method, params }) => {
  expect(method).toBe("eth_getBlockByNumber");
  expect(params).toEqual(["latest", false]);
  return { number: "0x1", baseFeePerGas };
};
const hexOf = (wei: bigint) => `0x${wei.toString(16)}`;

describe("the fee cap a Robinhood Chain transaction goes out with", () => {
  it("is twice the latest base fee with no tip, above the 0.02 gwei the chain suggests while its base fee sits just over it", async () => {
    // Seen on mainnet: base fee 0.020062 gwei while eth_gasPrice said 0.02, so a wallet pricing at 0.02 was refused.
    const base = BigInt(20_062_000);
    const cap = await chainFeeCap(block(hexOf(base)));
    expect(cap).toEqual({ maxFeePerGas: hexOf(base * BigInt(2)), maxPriorityFeePerGas: "0x0" });
    expect(BigInt(cap?.maxFeePerGas ?? "0x0")).toBeGreaterThan(BigInt(20_000_000));
  });

  it("leaves the wallet to price the transaction when the block can't be read or makes no sense", async () => {
    expect(await chainFeeCap(async () => Promise.reject(new Error("offline")))).toBeNull();
    for (const bad of [undefined, null, 20_062_000, "20062000", "0x", "0xzz", "0x0", `0x${"f".repeat(65)}`]) {
      expect(await chainFeeCap(block(bad))).toBeNull();
    }
    expect(await chainFeeCap(async () => null)).toBeNull();
  });

  it("doesn't hold the transaction up when the wallet is slow to answer", async () => {
    const started = Date.now();
    expect(await chainFeeCap(() => new Promise(() => {}), 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("is sent on Robinhood Chain mainnet only: the testnet sits at its floor, and MetaMask would call the cap a high site fee there", () => {
    expect(wantsFeeCap(4663)).toBe(true);
    expect(wantsFeeCap(46630)).toBe(false);
    expect(wantsFeeCap(1)).toBe(false);
  });
});
