// @vitest-environment node
// The launchpad's server code runs on viem, which needs Node's own Uint8Array.
import { BaseError, ContractFunctionRevertedError, decodeFunctionData, encodeAbiParameters, encodeEventTopics, InsufficientFundsError, type Log, toEventSelector, toFunctionSelector } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as accountRoute } from "@/app/api/tonk/account/route";
import { POST as actionRoute } from "@/app/api/tonk/action/route";
import { POST as launchRoute } from "@/app/api/tonk/launch/route";
import { GET as missionsRoute } from "@/app/api/tonk/missions/route";
import { GET as settingsRoute } from "@/app/api/tonk/settings/route";
import { GET as tokenRoute } from "@/app/api/tonk/token/[address]/route";
import { POST as tradeRoute } from "@/app/api/tonk/trade/route";
import { GET as txRoute } from "@/app/api/tonk/tx/route";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import { LAUNCHPAD_ABI } from "@/shared/tonk/server/abi";
import { TonkError, tonkClient } from "@/shared/tonk/server/client";
import { buildLaunch, launchParams, parseLaunchRequest } from "@/shared/tonk/server/launch";
import { readSettings } from "@/shared/tonk/server/settings";
import { missionFromLogs } from "@/shared/tonk/server/status";
import type { LaunchRequest, TonkSettingsJson } from "@/shared/tonk/types";

vi.mock("@/shared/tonk/server/client", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/server/client")>()), tonkClient: vi.fn() }));
vi.mock("@/shared/tonk/server/settings", () => ({ readSettings: vi.fn() }));

const CREATOR = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f";
const TOKEN = "0x1111111111111111111111111111111111111111";
const SETTINGS: TonkSettingsJson = { chainId: 46630, launchFee: "100000000000000", virtualEth: "1500000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "10000000", readAt: 1 };
/** The owner's first test launch (the prompt's section 12). */
const REQUEST: LaunchRequest = { creator: CREATOR, name: "Tonk Test One", ticker: "TTONE", description: "First test launch.", x: "@tonkfun", telegram: "", website: "tonkfun.fun", devBuy: "200000000000000", lock: "linear", share: 80, days: 180, crewBps: 200, creatorBps: 100, agent: null };

const item = (type: "function" | "event", name: string) => LAUNCHPAD_ABI.find((entry) => entry.type === type && entry.name === name)!;

describe("the launchpad's interface", () => {
  it("has the repaired build's selectors and topics (out/TonkpadRobinhood.sol, checked on 10 Nov 2026)", () => {
    const selectors = Object.fromEntries(["launchMission", "launchFee", "defaultVirtualEth", "defaultVirtualTokens", "paused", "devLocks"].map((name) => [name, toFunctionSelector(item("function", name) as never)]));
    expect(selectors).toEqual({ launchMission: "0xc91deb13", launchFee: "0xcf3cf573", defaultVirtualEth: "0x8d5c1b3f", defaultVirtualTokens: "0xa94cfac5", paused: "0x5c975abb", devLocks: "0x701fd7b0" });
    expect(toEventSelector(item("event", "MissionLaunched") as never)).toBe("0xbe8766625245a4f0c317e7809fb6d0f55785982b2a6409cf85d8f0cfc55ad05f");
    expect(toEventSelector(item("event", "CurveTrade") as never)).toBe("0x9023cca4dc57866b84c0d2f34234a47beddb527164d175e4d567a1e2f59abf2e");
  });
});

describe("a launch request", () => {
  it("passes what the Creator Studio sends", () => {
    expect(parseLaunchRequest(REQUEST)).toEqual(REQUEST);
    const agent = { name: "Commander Astro", role: "Mission commander", voice: "hype", brief: "Keep holders informed." };
    expect(parseLaunchRequest({ ...REQUEST, agent }).agent).toEqual(agent);
  });

  it.each([
    [{ creator: "not-an-address" }],
    [{ name: "   " }],
    [{ name: "x".repeat(33) }],
    [{ ticker: "ttone" }],
    [{ ticker: "$TTONE" }],
    [{ description: "y".repeat(281) }],
    [{ website: "javascript:alert(1)" }],
    [{ x: "not a handle!" }],
    [{ devBuy: "1.5" }],
    [{ devBuy: "-1" }],
    [{ lock: "forever" }],
    [{ share: 80.5 }],
    [{ crewBps: 50 }],
    [{ creatorBps: 250 }],
    [{ agent: { name: "", role: "r", voice: "hype", brief: "b" } }],
    [{ agent: { name: "n", role: "r", voice: "shouty", brief: "b" } }],
  ])("refuses %o", (patch) => {
    expect(() => parseLaunchRequest({ ...REQUEST, ...patch })).toThrow(TonkError);
    expect(() => parseLaunchRequest(null)).toThrow(TonkError);
  });

  it("becomes the contract's LaunchParams, and the same call comes back out of its calldata", async () => {
    const lock = { type: "linear" as const, sharePct: 80, days: 180 };
    const params = launchParams(REQUEST, lock);
    expect(params).toMatchObject({ name: "Tonk Test One", symbol: "TTONE", crewFeeBps: 200, creatorFeeBps: 100, lockType: 2, lockShareBps: 8000, lockDurationSeconds: BigInt(15_552_000), agentPrompt: "" });
    expect(JSON.parse(params.metadataUri)).toEqual({ v: 1, description: "First test launch.", x: "tonkfun", website: "https://tonkfun.fun/" });
    expect(launchParams({ ...REQUEST, lock: "none" }, { type: "none", sharePct: 0, days: 0 })).toMatchObject({ lockType: 0, lockShareBps: 0, lockDurationSeconds: BigInt(0) });
  });
});

/** A client that simulates and estimates as told, with the creator's balance. */
function fakeClient({ simulate = async () => ({}), balance = BigInt(10) ** BigInt(16) }: { simulate?: () => Promise<unknown>; balance?: bigint } = {}) {
  return { simulateContract: vi.fn(simulate), estimateContractGas: vi.fn(async () => BigInt(1_500_000)), getBalance: vi.fn(async () => balance), getGasPrice: vi.fn(async () => BigInt(10_000_000)) };
}
const useClient = (client: ReturnType<typeof fakeClient>) => vi.mocked(tonkClient).mockResolvedValue(client as never);

describe("building a launch", () => {
  beforeEach(() => {
    vi.mocked(readSettings).mockResolvedValue(SETTINGS);
  });

  it("simulates the exact call from the creator, then returns it unsigned with the figures it will produce", async () => {
    const client = fakeClient();
    useClient(client);
    const build = await buildLaunch(TONK_TESTNET, REQUEST);
    expect(build.tx.to).toBe(TONK_TESTNET.launchpad);
    expect(build.tx.value).toBe("300000000000000");
    expect(build.tx.gas).toBe("1950000");
    const { functionName, args } = decodeFunctionData({ abi: LAUNCHPAD_ABI, data: build.tx.data as `0x${string}` });
    expect(functionName).toBe("launchMission");
    expect(args?.[0]).toMatchObject({ name: "Tonk Test One", symbol: "TTONE", lockType: 2, lockShareBps: 8000 });
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ account: CREATOR, value: BigInt(300_000_000_000_000), functionName: "launchMission" }));
    expect([BigInt(build.bought) / BigInt(10) ** BigInt(18), BigInt(build.locked) / BigInt(10) ** BigInt(18)]).toEqual([BigInt(124_002_358), BigInt(99_201_886)]);
  });

  it.each([
    ["a fee pool over 4%", { crewBps: 300, creatorBps: 200 }],
    ["Creator Rewards above the lock's tier", { lock: "time", days: 20, creatorBps: 100 }],
    ["3% Creator Rewards on a Standard lock", { share: 75, creatorBps: 300, crewBps: 100 }],
    ["a lock without a dev buy", { devBuy: "0" }],
    ["a lock under 7 days", { lock: "time", days: 6, creatorBps: 50 }],
    ["a dev buy over the cap", { devBuy: "9000000000000000000" }],
  ] as [string, Partial<LaunchRequest>][])("refuses %s before asking the chain", async (_, patch) => {
    const client = fakeClient();
    useClient(client);
    await expect(buildLaunch(TONK_TESTNET, { ...REQUEST, ...patch })).rejects.toMatchObject({ code: "invalid" });
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("says why the launchpad or the wallet's balance won't allow it", async () => {
    vi.mocked(readSettings).mockResolvedValueOnce({ ...SETTINGS, paused: true });
    useClient(fakeClient());
    await expect(buildLaunch(TONK_TESTNET, REQUEST)).rejects.toMatchObject({ code: "paused" });

    const reverted = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: LAUNCHPAD_ABI, functionName: "launchMission", message: "Tonkpad: Total fee exceeds 5.0% cap" }) });
    useClient(fakeClient({ simulate: async () => Promise.reject(reverted) }));
    await expect(buildLaunch(TONK_TESTNET, REQUEST)).rejects.toMatchObject({ code: "refused" });

    useClient(fakeClient({ simulate: async () => Promise.reject(new BaseError("no funds", { cause: new InsufficientFundsError() })) }));
    await expect(buildLaunch(TONK_TESTNET, REQUEST)).rejects.toMatchObject({ code: "funds" });

    // Enough for the launch itself, but not for its gas too.
    useClient(fakeClient({ balance: BigInt(300_000_000_000_000) }));
    await expect(buildLaunch(TONK_TESTNET, REQUEST)).rejects.toMatchObject({ code: "funds" });

    useClient(fakeClient({ simulate: async () => Promise.reject(new Error("socket hang up")) }));
    await expect(buildLaunch(TONK_TESTNET, REQUEST)).rejects.toMatchObject({ code: "unavailable" });
  });
});

/** A log as a node returns it, for one of the launchpad's events. */
function log(address: string, eventName: "MissionLaunched" | "CurveTrade", indexed: Record<string, string>, data: unknown[]): Log {
  const event = item("event", eventName) as Extract<(typeof LAUNCHPAD_ABI)[number], { type: "event" }>;
  return {
    address: address as `0x${string}`,
    topics: encodeEventTopics({ abi: LAUNCHPAD_ABI, eventName, args: indexed as never }) as Log["topics"],
    data: encodeAbiParameters(event.inputs.filter((input) => !("indexed" in input && input.indexed)), data as never),
    blockHash: `0x${"0".repeat(64)}`,
    blockNumber: BigInt(151_200_000),
    logIndex: 0,
    transactionHash: `0x${"1".repeat(64)}`,
    transactionIndex: 0,
    removed: false,
  };
}
const launched = (address: string) => log(address, "MissionLaunched", { token: TOKEN, creator: CREATOR }, ["Tonk Test One", "TTONE", "{}", 200, 100, 2, 8000, BigInt(1_800_000_000), BigInt(200_000_000_000_000)]);
const bought = (address: string, isBuy = true) =>
  log(address, "CurveTrade", { token: TOKEN, trader: CREATOR }, [isBuy, BigInt(200_000_000_000_000), BigInt(124_002_358) * BigInt(10) ** BigInt(18), BigInt(2_000_000_000_000), BigInt(0), BigInt(2_000_000_000_000), BigInt(1), BigInt(1), BigInt(1)]);

describe("a launch's receipt", () => {
  it("gives the mission and the creator's buy, from the launchpad's own logs", () => {
    const mission = missionFromLogs(TONK_TESTNET, [launched(TONK_TESTNET.launchpad), bought(TONK_TESTNET.launchpad)], 151_200_000, BigInt(99));
    expect(mission).toMatchObject({ token: TOKEN, name: "Tonk Test One", symbol: "TTONE", crewBps: 200, creatorBps: 100, lockType: "linear", lockedBps: 8000, lockEnd: 1_800_000_000, devBuy: "200000000000000", bought: "124002358000000000000000000", locked: "99", protocolFee: "2000000000000", creatorFee: "2000000000000", block: 151_200_000 });
    expect(mission?.creator.toLowerCase()).toBe(CREATOR.toLowerCase());
  });

  it("ignores the same event from any other contract, and transactions that launched nothing", () => {
    const impostor = "0x2222222222222222222222222222222222222222";
    expect(missionFromLogs(TONK_TESTNET, [launched(impostor), bought(impostor)], 1, BigInt(0))).toBeNull();
    expect(missionFromLogs(TONK_TESTNET, [bought(TONK_TESTNET.launchpad)], 1, BigInt(0))).toBeNull();
    expect(missionFromLogs(TONK_TESTNET, [], 1, BigInt(0))).toBeNull();
    // A launch with no dev buy has no trade: nothing bought.
    expect(missionFromLogs(TONK_TESTNET, [launched(TONK_TESTNET.launchpad)], 1, BigInt(0))).toMatchObject({ bought: "0", protocolFee: "0" });
  });
});

describe("the launchpad's routes where no network is connected", () => {
  it("answer closed, never cached: production and the demo have no launchpad to call", async () => {
    const responses = await Promise.all([
      settingsRoute(new Request("http://x/api/tonk/settings")),
      txRoute(new Request(`http://x/api/tonk/tx?hash=0x${"a".repeat(64)}`)),
      launchRoute(new Request("http://x/api/tonk/launch", { method: "POST", body: JSON.stringify(REQUEST) })),
      // The token page's routes: there is no mission to read, trade or manage here either.
      tokenRoute(new Request(`http://x/api/tonk/token/${TOKEN}`), { params: Promise.resolve({ address: TOKEN }) }),
      accountRoute(new Request(`http://x/api/tonk/account?token=${TOKEN}&owner=${CREATOR}`)),
      missionsRoute(new Request("http://x/api/tonk/missions")),
      tradeRoute(new Request("http://x/api/tonk/trade", { method: "POST", body: JSON.stringify({ token: TOKEN, trader: CREATOR, side: "buy", amount: "1", minOut: "1", referrer: null }) })),
      actionRoute(new Request("http://x/api/tonk/action", { method: "POST", body: JSON.stringify({ kind: "claim", token: TOKEN, owner: CREATOR }) })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "closed" });
    }
    expect(readSettings).not.toHaveBeenCalled();
    expect(tonkClient).not.toHaveBeenCalled();
  });
});
