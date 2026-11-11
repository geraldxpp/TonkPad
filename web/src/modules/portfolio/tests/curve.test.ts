import type { PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { tokenPrice } from "@/shared/tonk/curve";
import { mainnetNetwork } from "@/shared/tonk/networks";
import { MAX_CURVE_LOOKUPS, readCurvePrices } from "../server/curve";

const NETWORK = mainnetNetwork({ launchpad: `0x${"a".repeat(40)}`, migrator: `0x${"b".repeat(40)}`, block: "1" });
const ON_CURVE = `0x${"1".repeat(40)}`;
const GRADUATED = `0x${"2".repeat(40)}`;
const STRANGER = `0x${"3".repeat(40)}`;
const BROKEN = `0x${"4".repeat(40)}`;
const ZERO = "0x0000000000000000000000000000000000000000";
const V_ETH = BigInt("1500000000000000000");
const V_TOKENS = BigInt("1000000000000000000000000000");

/** A launchpad that knows two of the four tokens, has graduated one of them, and can't answer for the fourth. */
function connect() {
  const readContract = vi.fn(async ({ args }: { args: readonly string[] }) => {
    const [token] = args;
    if (token === BROKEN) throw new Error("socket hang up");
    const known = token === ON_CURVE || token === GRADUATED;
    return [known ? token : ZERO, ZERO, BigInt(0), BigInt(0), 200, 100, token === GRADUATED, V_ETH, V_TOKENS, BigInt(0), BigInt(0), ZERO, "", ""];
  });
  return { client: { readContract } as unknown as PublicClient, readContract };
}

describe("a launch's curve price in Portfolio", () => {
  it("prices a launch still on its curve at the curve's price in dollars, and nothing else", async () => {
    const { client } = connect();
    const prices = await readCurvePrices([ON_CURVE.toUpperCase().replace("0X", "0x"), GRADUATED, STRANGER, BROKEN], 3_000, NETWORK, async () => client);
    expect([...prices.keys()]).toEqual([ON_CURVE]);
    expect(prices.get(ON_CURVE)?.priceUsd).toBeCloseTo(tokenPrice(V_ETH, V_TOKENS) * 3_000, 12);
  });

  it("asks nothing without a mainnet launchpad or an ETH price, and at most 50 tokens a read", async () => {
    const { client, readContract } = connect();
    expect((await readCurvePrices([ON_CURVE], 3_000, null, async () => client)).size).toBe(0);
    expect((await readCurvePrices([ON_CURVE], null, NETWORK, async () => client)).size).toBe(0);
    expect((await readCurvePrices([ON_CURVE], 0, NETWORK, async () => client)).size).toBe(0);
    expect(readContract).not.toHaveBeenCalled();
    const many = Array.from({ length: 80 }, (_, index) => `0x${String(index).padStart(40, "0")}`);
    await readCurvePrices(many, 3_000, NETWORK, async () => client);
    expect(readContract).toHaveBeenCalledTimes(MAX_CURVE_LOOKUPS);
  });

  it("leaves everything unpriced when the chain can't be reached", async () => {
    const prices = await readCurvePrices([ON_CURVE], 3_000, NETWORK, async () => Promise.reject(new Error("down")));
    expect(prices.size).toBe(0);
  });
});
