import { describe, expect, it } from "vitest";
import { type ChainRead, chainFees, evmSendParams, sendsLegacy } from "@/shared/wallet/fees";

const block = (baseFeePerGas: unknown): ChainRead => async ({ method, params }) => {
  expect(method).toBe("eth_getBlockByNumber");
  expect(params).toEqual(["latest", false]);
  return { number: "0x1", baseFeePerGas };
};
const hexOf = (wei: bigint) => `0x${wei.toString(16)}`;

describe("the fees a Robinhood Chain mainnet transaction goes out with", () => {
  it("are the legacy format at twice the latest base fee, above the 0.02 gwei the chain suggests while its base fee sits just over it", async () => {
    // Seen on mainnet: base fee 0.020062 gwei while eth_gasPrice said 0.02, so a wallet pricing at 0.02 was refused.
    const base = BigInt(20_062_000);
    const fees = await chainFees(block(hexOf(base)));
    expect(fees).toEqual({ type: "0x0", gasPrice: hexOf(base * BigInt(2)) });
    expect(BigInt(fees.gasPrice ?? "0x0")).toBeGreaterThan(BigInt(20_000_000));
  });

  it("never carry EIP-1559 fields: MetaMask sends those through Smart Transactions, which cancel launches and curve buys", async () => {
    const fees = await chainFees(block(hexOf(BigInt(20_062_000))));
    expect(fees).not.toHaveProperty("maxFeePerGas");
    expect(fees).not.toHaveProperty("maxPriorityFeePerGas");
    // The type is explicit: MetaMask turns a bare gasPrice into an EIP-1559 transaction.
    expect(fees.type).toBe("0x0");
  });

  it("stay legacy and leave the price to the wallet when the block can't be read or makes no sense", async () => {
    expect(await chainFees(async () => Promise.reject(new Error("offline")))).toEqual({ type: "0x0" });
    for (const bad of [undefined, null, 20_062_000, "20062000", "0x", "0xzz", "0x0", `0x${"f".repeat(65)}`]) {
      expect(await chainFees(block(bad))).toEqual({ type: "0x0" });
    }
    expect(await chainFees(async () => null)).toEqual({ type: "0x0" });
  });

  it("don't hold the transaction up when the wallet is slow to answer", async () => {
    const started = Date.now();
    expect(await chainFees(() => new Promise(() => {}), 50)).toEqual({ type: "0x0" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("apply on Robinhood Chain mainnet only: MetaMask runs no Smart Transactions on the testnet, and other networks price their own fees", () => {
    expect(sendsLegacy(4663)).toBe(true);
    expect(sendsLegacy(46630)).toBe(false);
    expect(sendsLegacy(1)).toBe(false);
    expect(sendsLegacy(42161)).toBe(false);
  });
});

describe("what reaches the wallet's eth_sendTransaction", () => {
  const TX = { from: "0x3daa6db67596ce7633caa7ef42ca074a73db9490", to: "0xbCaF0eCF36D15622a13D04b5ac58d312818BB4f0", data: "0xdb61c76e", value: "100000000000000", gas: "250000" };

  it("on Robinhood Chain mainnet is the transaction in the legacy format at twice the base fee, gas kept, and nothing of EIP-1559", async () => {
    const params = await evmSendParams(TX, 4663, block(hexOf(BigInt(20_062_000))));
    expect(params).toEqual({ from: TX.from, to: TX.to, data: TX.data, value: hexOf(BigInt(TX.value)), gas: hexOf(BigInt(250_000)), type: "0x0", gasPrice: hexOf(BigInt(40_124_000)) });
    expect(params).not.toHaveProperty("maxFeePerGas");
    expect(params).not.toHaveProperty("maxPriorityFeePerGas");
  });

  it("on Robinhood Chain mainnet stays legacy when the block can't be read, the wallet setting the price", async () => {
    const params = await evmSendParams({ ...TX, gas: null }, 4663, async () => Promise.reject(new Error("offline")));
    expect(params).toEqual({ from: TX.from, to: TX.to, data: TX.data, value: hexOf(BigInt(TX.value)), type: "0x0" });
  });

  it("anywhere else carries no fee fields and never reads the chain: the wallet prices it", async () => {
    for (const chainId of [46630, 1, 8453, 42161]) {
      let asked = false;
      const params = await evmSendParams(TX, chainId, async () => {
        asked = true;
        return { baseFeePerGas: "0x1" };
      });
      expect(params).toEqual({ from: TX.from, to: TX.to, data: TX.data, value: hexOf(BigInt(TX.value)), gas: hexOf(BigInt(250_000)) });
      expect(asked).toBe(false);
    }
  });
});
