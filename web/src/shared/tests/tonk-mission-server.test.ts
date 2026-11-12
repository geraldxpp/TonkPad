// @vitest-environment node
// The launchpad's server code runs on viem, which needs Node's own Uint8Array.
import { BaseError, ContractFunctionRevertedError, decodeFunctionData, ExecutionRevertedError, HttpRequestError, encodeAbiParameters, encodeEventTopics, type Log, toEventSelector, toFunctionSelector } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/shared/swap/server/cache";
import { sellQuote } from "@/shared/tonk/curve";
import { decodeAgent, decodeMetadata } from "@/shared/tonk/metadata";
import type { ActionRequest, TradeRequest } from "@/shared/tonk/mission";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import { ARBSYS_ABI, LAUNCHPAD_ABI, TOKEN_ABI } from "@/shared/tonk/server/abi";
import { readAccount } from "@/shared/tonk/server/account";
import { buildAction, parseActionRequest } from "@/shared/tonk/server/action";
import { TonkError, tonkClient } from "@/shared/tonk/server/client";
import { readLatestMissions, readMission, readMissionPage } from "@/shared/tonk/server/mission";
import { txEvents } from "@/shared/tonk/server/status";
import { buildTrade, parseTradeRequest } from "@/shared/tonk/server/trade";

vi.mock("@/shared/tonk/server/client", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/server/client")>()), tonkClient: vi.fn() }));

const PAD = TONK_TESTNET.launchpad;
const TOKEN = "0xEaC30db90c3ac240D0122a07e46be8C161051A8A";
const CREATOR = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f";
const BUYER = "0x3333333333333333333333333333333333333333";
const REFERRER = "0x4444444444444444444444444444444444444444";
const ZERO = "0x0000000000000000000000000000000000000000";
const big = (value: string | number) => BigInt(value);
/** The lock's start: the launch block's time. One day in, a 180-day vest has unlocked 1/180 of it. */
const LAUNCHED = 1_794_308_686;
const DAY = 86_400;

/** The owner's live token on 10 Nov 2026 at block 151,327,091 (the prompt's section 14.5). */
function chain() {
  return {
    mission: true,
    name: "Tonk Test One",
    symbol: "TTONE",
    creator: CREATOR,
    launchBlock: big(151_319_782),
    block: big(151_327_091),
    graduated: false,
    paused: false,
    virtualEth: big("1696000000000000"),
    virtualTokens: big("948997641509433962264150943"),
    realEth: big("196000000000000"),
    tokensLeft: big("675997641509433962264150943"),
    metadata: '{"v":1,"description":"First test launch."}',
    agentPrompt: "",
    lock: [2, 8000, big(LAUNCHED), big(LAUNCHED + 180 * DAY), big("99201886792452830188679245"), big(0)] as [number, number, bigint, bigint, bigint, bigint],
    checkpoint: big(0),
    eligibleSupply: big("124002358490566037735849057"),
    /** The token's Crew floor (10M tokens), or what reading it throws. */
    crewFloor: big("10000000000000000000000000") as bigint | Error,
    crewPaid: big(0),
    held: { [CREATOR.toLowerCase()]: big("24800471698113207547169812") } as Record<string, bigint>,
    /** Wallets the token leaves out of the eligible supply. */
    excluded: {} as Record<string, boolean>,
    allowance: big(0),
    unpaidRewards: big(0),
    unpaidEth: big(0),
    eth: big(10) ** big(16),
    gasPrice: big(100_000_000),
    /** What the contract answers when the call is simulated; a function to throw. */
    simulated: big(0) as bigint | (() => never),
    /** Patch A: a paused launchpad still takes sells (its zero-sale probe fails on the amount, not the pause). */
    pausedSells: false,
    callFails: null as unknown,
    /** The migrator the launchpad would graduate into: the deployed one unless a test says otherwise. */
    migrator: TONK_TESTNET.migrator as string,
  };
}
type Chain = ReturnType<typeof chain>;

/** A client that answers from `state` and records what it was asked. */
function fakeClient(state: Chain) {
  const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
    switch (functionName) {
      case "missions":
        return [state.mission ? TOKEN : ZERO, state.creator, big(LAUNCHED), state.launchBlock, 200, 100, state.graduated, state.virtualEth, state.virtualTokens, state.realEth, state.tokensLeft, ZERO, state.metadata, state.agentPrompt];
      case "devLocks":
        return state.lock;
      case "devVestedCheckpoint":
        return state.checkpoint;
      case "paused":
        return state.paused;
      case "graduationMigrator":
        return state.migrator;
      case "name":
        return state.name;
      case "symbol":
        return state.symbol;
      case "eligibleSupply":
        return state.eligibleSupply;
      case "CREW_ELIGIBLE_FLOOR":
        if (state.crewFloor instanceof Error) throw state.crewFloor;
        return state.crewFloor;
      case "isExcludedFromCrew":
        return state.excluded[String(args?.[0]).toLowerCase()] === true;
      case "totalCrewRewardsPaid":
        return state.crewPaid;
      case "balanceOf":
        return state.held[String(args?.[0]).toLowerCase()] ?? big(0);
      case "arbBlockNumber":
        return state.block;
      case "allowance":
        return state.allowance;
      case "viewUnpaidRewards":
        return state.unpaidRewards;
      case "claimableEth":
        return state.unpaidEth;
      default:
        throw new Error(`unexpected read ${functionName}`);
    }
  });
  const simulateContract = vi.fn(async (call: { functionName: string; args?: readonly unknown[] }) => {
    // The zero sale that asks whether a paused launchpad still takes sells.
    if (call.functionName === "sell" && call.args?.[1] === big(0)) {
      throw state.pausedSells ? reverted(LAUNCHPAD_ABI, "Tonkpad: Zero tokens") : new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: LAUNCHPAD_ABI, functionName: "sell", data: "0xd93c0665" }) });
    }
    if (typeof state.simulated === "function") return state.simulated();
    return { result: state.simulated };
  });
  return {
    readContract,
    simulateContract,
    getBlockNumber: vi.fn(async () => state.block),
    getTransactionReceipt: vi.fn(async (): Promise<unknown> => {
      throw new Error("no receipt");
    }),
    estimateContractGas: vi.fn(async () => big(271_000)),
    estimateGas: vi.fn(async () => big(129_000)),
    call: vi.fn(async () => {
      if (state.callFails) throw state.callFails;
      return { data: "0x" };
    }),
    getBalance: vi.fn(async () => state.eth),
    getGasPrice: vi.fn(async () => state.gasPrice),
    getContractEvents: vi.fn(async () => [] as unknown[]),
    getBlock: vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({ number: blockNumber, timestamp: big(LAUNCHED) })),
  };
}
function connect(state: Chain) {
  const client = fakeClient(state);
  vi.mocked(tonkClient).mockResolvedValue(client as never);
  return client;
}
const reverted = (abi: typeof LAUNCHPAD_ABI | typeof TOKEN_ABI, message: string) => new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi, functionName: "buy", message }) });

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
  vi.setSystemTime((LAUNCHED + DAY) * 1000);
});
afterEach(() => vi.useRealTimers());

describe("the interface the token page uses", () => {
  const selectors = (abi: readonly unknown[], names: string[]) =>
    Object.fromEntries(names.map((name) => [name, toFunctionSelector(abi.find((entry) => (entry as { type: string; name?: string }).type === "function" && (entry as { name?: string }).name === name) as never)]));
  const topic = (abi: readonly unknown[], name: string) => toEventSelector(abi.find((entry) => (entry as { type: string; name?: string }).type === "event" && (entry as { name?: string }).name === name) as never);

  it("has the repaired build's selectors and topics (out/TonkpadRobinhood.sol, checked on 10 Nov 2026)", () => {
    expect(selectors(LAUNCHPAD_ABI, ["missions", "devVestedCheckpoint", "claimableDevTokens", "claimableEth", "buy", "sell", "claimDevTokens", "extendDevLock", "updateMissionMetadata", "withdrawAccruedEth"])).toEqual({
      missions: "0x2e584cd9",
      devVestedCheckpoint: "0x12198ea2",
      claimableDevTokens: "0x0f6a3d24",
      claimableEth: "0x4793dc40",
      buy: "0xdb61c76e",
      sell: "0x2dc8f867",
      claimDevTokens: "0x1c46c674",
      extendDevLock: "0x78df87d2",
      updateMissionMetadata: "0x15332dbe",
      withdrawAccruedEth: "0xa6379cc0",
    });
    expect(selectors(TOKEN_ABI, ["approve", "eligibleSupply", "totalCrewRewardsPaid", "viewUnpaidRewards", "sweepMyCrewRewards"])).toEqual({
      approve: "0x095ea7b3",
      eligibleSupply: "0x6ade07b0",
      totalCrewRewardsPaid: "0xe3f13023",
      viewUnpaidRewards: "0x223d0417",
      sweepMyCrewRewards: "0x42fd0639",
    });
    expect(selectors(ARBSYS_ABI, ["arbBlockNumber"])).toEqual({ arbBlockNumber: "0xa3b1b31d" });
    expect(["DevTokensClaimed", "LockExtended", "MetadataUpdated", "MissionGraduated", "FallbackEthWithdrawn"].map((name) => topic(LAUNCHPAD_ABI, name))).toEqual([
      "0x0903db5d90536dfae250f057fdc011becb83172fe2332b1d0b48057926ac9523",
      "0x0d5cdc917e4bb46b75a716ee53a031c8263b0e03b416ad34af41bdb778297d9a",
      "0x6c1850fce35387a891e82ca88e975790ab6f0709e9ed6842e01397f296012a7e",
      "0x943c53f3ef1c2708584f6f67a4a2f9e22f7bfa341498907bfa2cb9903f24ef5a",
      "0x68e0973a41f9a770e905aec6c5f3191d2c5bf5d36d67f6282ae4e4199ec29ceb",
    ]);
    expect(topic(TOKEN_ABI, "CrewRewardPaid")).toBe("0x5889e9284770a4129dae32731759b539bdb83968409ecec45916cc70d7f4c7bd");
  });
});

describe("reading a mission", () => {
  it("gives the launchpad's record, the lock and the token's Crew figures, read at one block", async () => {
    const client = connect(chain());
    const mission = await readMission(TONK_TESTNET, TOKEN);
    expect(mission).toMatchObject({
      chainId: 46630,
      token: TOKEN,
      name: "Tonk Test One",
      symbol: "TTONE",
      creator: CREATOR,
      launchedAt: LAUNCHED,
      launchBlock: 151_319_782,
      crewBps: 200,
      creatorBps: 100,
      graduated: false,
      paused: false,
      virtualEth: "1696000000000000",
      tokensLeft: "675997641509433962264150943",
      realEth: "196000000000000",
      creatorHeld: "24800471698113207547169812",
      block: 151_327_091,
      buyingOpen: true,
      lock: { type: "linear", lockedBps: 8000, start: LAUNCHED, end: LAUNCHED + 180 * DAY, total: "99201886792452830188679245", claimed: "0", checkpoint: "0" },
    });
    // Identical reads inside two seconds share one round trip.
    await readMission(TONK_TESTNET, TOKEN);
    expect(client.readContract.mock.calls.filter(([call]) => call.functionName === "missions")).toHaveLength(1);
  });

  it("has no lock when the launchpad holds none, and closes buying inside the launch-block shield", async () => {
    const state = chain();
    state.lock = [0, 0, big(0), big(0), big(0), big(0)];
    state.block = state.launchBlock + big(1);
    connect(state);
    expect(await readMission(TONK_TESTNET, TOKEN)).toMatchObject({ lock: null, buyingOpen: false });
  });

  it("bounds what a direct call to the contract can store: the contract itself sets no maximum", async () => {
    const state = chain();
    state.name = `\u0000Very ${"x".repeat(100_000)}`;
    state.symbol = "S".repeat(500);
    state.metadata = `{"v":1,"description":"${"d".repeat(5_000)}"}`;
    state.agentPrompt = "p".repeat(5_000);
    connect(state);
    const mission = await readMission(TONK_TESTNET, TOKEN);
    expect([mission.name.length, mission.name.startsWith("Very xxx"), mission.symbol]).toEqual([64, true, "S".repeat(16)]);
    // Longer than anything the app writes: not its JSON, so not passed on at all.
    expect([mission.metadata, mission.agentPrompt]).toEqual(["", ""]);

    clearCache();
    state.name = "\u0007\u0008";
    state.symbol = "   ";
    state.metadata = '{"v":1,"description":"Short enough."}';
    connect(state);
    // Nothing printable to show: the token's own address stands in.
    expect(await readMission(TONK_TESTNET, TOKEN)).toMatchObject({ name: "0xEaC3…1A8A", symbol: "EAC30D", metadata: '{"v":1,"description":"Short enough."}' });
  });

  it("shows a name and ticker as they really read: no direction, zero-width or tag characters", async () => {
    const state = chain();
    // U+202E would draw "ENO TSET KNOT" right to left, as "TONK TEST ONE".
    state.name = "\u{202E}ENO TSET KNOT\u{200B}";
    state.symbol = "TT\u{200B}O\u{E0041}NE\u{2066}";
    connect(state);
    expect(await readMission(TONK_TESTNET, TOKEN)).toMatchObject({ name: "ENO TSET KNOT", symbol: "TTONE" });

    clearCache();
    state.name = "\u{200B}\u{202E}\u{3164}";
    state.symbol = "\u{2800}\u{FEFF}";
    connect(state);
    expect(await readMission(TONK_TESTNET, TOKEN)).toMatchObject({ name: "0xEaC3…1A8A", symbol: "EAC30D" });
  });

  it("says an address the launchpad doesn't know is missing, and an unreadable chain unavailable", async () => {
    const state = chain();
    state.mission = false;
    connect(state);
    await expect(readMission(TONK_TESTNET, TOKEN)).rejects.toMatchObject({ code: "missing", status: 404 });

    clearCache();
    const client = connect(chain());
    client.readContract.mockRejectedValue(new Error("socket hang up"));
    await expect(readMissionPage(TONK_TESTNET, TOKEN)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("reads the page's trades newest first with each block's time, and the latest launches", async () => {
    const client = connect(chain());
    const trade = (blockNumber: number, isBuy: boolean, logIndex: number) => ({
      blockNumber: big(blockNumber),
      transactionHash: `0x${String(logIndex).repeat(64)}`,
      logIndex,
      args: { token: TOKEN, trader: isBuy ? CREATOR : BUYER, isBuy, grossEth: big(200), tokenAmount: big(1000), protocolFee: big(2), crewFee: big(4), creatorFee: big(2), newVirtualEth: big(1700), newVirtualTokens: big(9000), remainingCurveTokens: big(1) },
    });
    client.getContractEvents.mockResolvedValueOnce([trade(151_319_782, true, 1), trade(151_320_000, false, 2)]);
    const page = await readMissionPage(TONK_TESTNET, TOKEN);
    expect(page.trades.map((row) => [row.side, row.block, row.trader, row.eth, row.tokens, row.fees, row.time])).toEqual([
      ["sell", 151_320_000, BUYER, "200", "1000", "8", LAUNCHED],
      ["buy", 151_319_782, CREATOR, "200", "1000", "8", LAUNCHED],
    ]);
    expect(client.getContractEvents).toHaveBeenCalledWith(expect.objectContaining({ eventName: "CurveTrade", args: { token: TOKEN }, fromBlock: big(151_319_782) }));

    client.getContractEvents.mockResolvedValueOnce([{ blockNumber: big(151_319_782), args: { token: TOKEN, creator: CREATOR, name: "Tonk Test One", symbol: "TTONE", metadataUri: "" } }]);
    expect(await readLatestMissions(TONK_TESTNET)).toEqual([{ token: TOKEN, name: "Tonk Test One", symbol: "TTONE", creator: CREATOR, block: 151_319_782, time: LAUNCHED, image: "" }]);
    expect(client.getContractEvents).toHaveBeenLastCalledWith(expect.objectContaining({ eventName: "MissionLaunched", fromBlock: big(TONK_TESTNET.launchpadBlock) }));
  });

  it("reads a wallet's standing: coin, tokens, allowance, unpaid rewards and unpaid ETH", async () => {
    const state = chain();
    state.unpaidRewards = big(1_000_000_000_000);
    state.unpaidEth = big(5);
    connect(state);
    expect(await readAccount(TONK_TESTNET, TOKEN, CREATOR)).toMatchObject({ owner: CREATOR, eth: "10000000000000000", tokens: "24800471698113207547169812", allowance: "0", unpaidRewards: "1000000000000", unpaidEth: "5", isCreator: true });
    expect(await readAccount(TONK_TESTNET, TOKEN, BUYER)).toMatchObject({ tokens: "0", isCreator: false });
  });
});

const BUY: TradeRequest = { token: TOKEN, trader: BUYER, side: "buy", amount: "50000000000000", minOut: "25858009131036870347931452", referrer: null };
const SELL: TradeRequest = { token: TOKEN, trader: CREATOR, side: "sell", amount: "1000000000000000000000000", minOut: "1", referrer: null };
/** What the deployed contract answered for each, simulated on 10 Nov 2026. */
const BOUGHT = big("26119201142461485199930760");
const SOLD_FOR = big("1713856886439");
const APPROVAL = `0x${"a1".repeat(32)}`;

/** The creator's confirmed approval of the launchpad, as its receipt shows it. */
function approvalReceipt(blockNumber: bigint, value: bigint) {
  const topics = encodeEventTopics({ abi: TOKEN_ABI, eventName: "Approval", args: { owner: CREATOR as `0x${string}`, spender: PAD } });
  const log = { address: TOKEN, topics, data: encodeAbiParameters([{ type: "uint256" }], [value]), blockNumber, transactionHash: APPROVAL, logIndex: 0, blockHash: `0x${"b".repeat(64)}`, transactionIndex: 0, removed: false };
  return { status: "success", from: CREATOR, to: TOKEN, blockNumber, logs: [log] };
}

describe("a trade request", () => {
  it("passes what the page sends, and refuses anything else", () => {
    expect(parseTradeRequest(BUY)).toEqual({ ...BUY, approval: null });
    expect(parseTradeRequest({ ...SELL, referrer: REFERRER })).toEqual({ ...SELL, referrer: REFERRER, approval: null });
    expect(parseTradeRequest({ ...SELL, approval: APPROVAL })).toEqual({ ...SELL, approval: APPROVAL });
    for (const patch of [{ token: "0x12" }, { trader: "me" }, { side: "swap" }, { amount: "0" }, { amount: "1.5" }, { amount: "-1" }, { minOut: "0" }, { minOut: 5 }, { referrer: "0xnope" }, { approval: "0x12" }, { approval: 7 }]) {
      expect(() => parseTradeRequest({ ...BUY, ...patch })).toThrow(TonkError);
    }
    expect(() => parseTradeRequest(null)).toThrow(TonkError);
  });
});

describe("building a buy", () => {
  it("simulates the exact call at the block it read, and returns it unsigned when the contract agrees with the quote", async () => {
    const state = chain();
    state.simulated = BOUGHT;
    const client = connect(state);
    const build = await buildTrade(TONK_TESTNET, BUY);
    if (build.step !== "trade") throw new Error(`built ${build.step}`);
    expect(build.quote).toMatchObject({ out: String(BOUGHT), minOut: BUY.minOut, protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000", completesCurve: false });
    expect(build.tx).toMatchObject({ to: PAD, value: "50000000000000", gas: "352300" });
    expect(decodeFunctionData({ abi: LAUNCHPAD_ABI, data: build.tx.data as `0x${string}` })).toMatchObject({ functionName: "buy", args: [TOKEN, big(BUY.minOut), ZERO] });
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ account: BUYER, functionName: "buy", value: big(50_000_000_000_000), blockNumber: state.block }));
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "missions", blockNumber: state.block }));
  });

  it("names a referrer only when it isn't the trader", async () => {
    const state = chain();
    state.simulated = BOUGHT;
    connect(state);
    const referred = await buildTrade(TONK_TESTNET, { ...BUY, referrer: REFERRER });
    const self = await buildTrade(TONK_TESTNET, { ...BUY, referrer: BUYER });
    const arg = (build: typeof referred) => (build.step === "trade" ? decodeFunctionData({ abi: LAUNCHPAD_ABI, data: build.tx.data as `0x${string}` }).args?.[2] : null);
    expect([arg(referred), arg(self)]).toEqual([REFERRER, ZERO]);
  });

  it("stops before the wallet when the price moved past the minimum, with the fresh state", async () => {
    const client = connect(chain());
    const build = await buildTrade(TONK_TESTNET, { ...BUY, minOut: String(BOUGHT + big(1)) });
    expect(build).toMatchObject({ step: "moved", mission: { virtualEth: "1696000000000000" } });
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("refuses when the contract's answer and the mirrored quote disagree", async () => {
    const state = chain();
    state.simulated = BOUGHT - big(1);
    connect(state);
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("builds a buy that completes the curve: all that is left, with the rest refunded", async () => {
    const state = chain();
    state.simulated = state.tokensLeft;
    connect(state);
    const build = await buildTrade(TONK_TESTNET, { ...BUY, amount: "9000000000000000", minOut: "1" });
    expect(build).toMatchObject({ step: "trade", quote: { out: "675997641509433962264150943", refund: "4625412087912087", completesCurve: true } });
  });

  it.each([
    ["graduated", (state: Chain) => void (state.graduated = true), "graduated"],
    ["paused", (state: Chain) => void (state.paused = true), "paused"],
    ["inside the launch-block shield", (state: Chain) => void (state.block = state.launchBlock + big(1)), "early"],
    ["short of ETH for the amount and its gas", (state: Chain) => void ((state.simulated = BOUGHT), (state.eth = big(50_000_000_000_000))), "funds"],
    ["refused by the contract", (state: Chain) => void (state.simulated = () => Promise.reject(reverted(LAUNCHPAD_ABI, "Tonkpad: Slippage")) as never), "refused"],
    // The launchpad was paused between the read and the simulation: its own error, by selector.
    ["paused in between", (state: Chain) => void (state.simulated = () => Promise.reject(new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: LAUNCHPAD_ABI, functionName: "buy", data: "0xd93c0665" }) })) as never), "paused"],
    ["unreachable", (state: Chain) => void (state.simulated = () => Promise.reject(new Error("socket hang up")) as never), "unavailable"],
  ] as [string, (state: Chain) => void, string][])("refuses a buy when %s", async (_, change, code) => {
    const state = chain();
    change(state);
    connect(state);
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code });
  });
});

describe("the deployed migrator", () => {
  it("builds nothing that could complete a curve once the launchpad names another migrator", async () => {
    const state = chain();
    state.migrator = "0x00000000000000000000000000000000000bad00";
    state.simulated = BOUGHT;
    const client = connect(state);
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "migrator", status: 409 });
    expect(client.simulateContract).not.toHaveBeenCalled();
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "graduationMigrator", blockNumber: state.block }));
  });

  it("still lets a holder sell: a sale never graduates a curve", async () => {
    const state = chain();
    state.migrator = "0x00000000000000000000000000000000000bad00";
    state.allowance = big(SELL.amount);
    state.simulated = SOLD_FOR;
    connect(state);
    const build = await buildTrade(TONK_TESTNET, SELL);
    expect(build.step).toBe("trade");
  });

  it("matches the migrator whatever its letter case, and says unavailable when it can't be read", async () => {
    const state = chain();
    state.migrator = TONK_TESTNET.migrator.toLowerCase();
    state.simulated = BOUGHT;
    connect(state);
    expect((await buildTrade(TONK_TESTNET, BUY)).step).toBe("trade");
    const client = connect(chain());
    client.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "graduationMigrator") throw new Error("socket hang up");
      return fakeClient(chain()).readContract({ functionName });
    });
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("building a sell", () => {
  it("asks first for an approval of exactly the amount sold, never more", async () => {
    const client = connect(chain());
    const build = await buildTrade(TONK_TESTNET, SELL);
    if (build.step !== "approve") throw new Error(`built ${build.step}`);
    expect(build.tx).toMatchObject({ to: TOKEN, value: "0" });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: build.tx.data as `0x${string}` })).toMatchObject({ functionName: "approve", args: [PAD, big(SELL.amount)] });
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("builds the sale once the launchpad may take the tokens, at the contract's own figure", async () => {
    const state = chain();
    state.allowance = big(SELL.amount);
    state.simulated = SOLD_FOR;
    const client = connect(state);
    const build = await buildTrade(TONK_TESTNET, SELL);
    if (build.step !== "trade") throw new Error(`built ${build.step}`);
    expect(build.quote).toMatchObject({ side: "sell", out: String(SOLD_FOR), capped: false });
    expect(build.tx).toMatchObject({ to: PAD, value: "0" });
    expect(decodeFunctionData({ abi: LAUNCHPAD_ABI, data: build.tx.data as `0x${string}` })).toMatchObject({ functionName: "sell", args: [TOKEN, big(SELL.amount), big(1), ZERO] });
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ account: CREATOR, functionName: "sell", blockNumber: state.block }));
  });

  it("lets the last eligible holder sell out at the contract's own figure: no Crew fee once nobody eligible is left", async () => {
    // The contract moves the tokens to the (excluded) launchpad first, then checks the eligible supply.
    const state = chain();
    const all = state.held[CREATOR.toLowerCase()];
    state.eligibleSupply = all;
    state.allowance = all;
    const curve = { virtualEth: state.virtualEth, virtualTokens: state.virtualTokens, tokensLeft: state.tokensLeft, realEth: state.realEth };
    state.simulated = sellQuote(curve, all, 0, 100).netEthOut;
    const client = connect(state);
    const build = await buildTrade(TONK_TESTNET, { ...SELL, amount: String(all) });
    if (build.step !== "trade") throw new Error(`built ${build.step}`);
    expect(build.quote).toMatchObject({ crewFee: "0", out: String(state.simulated) });
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "isExcludedFromCrew", args: [CREATOR], blockNumber: state.block }));
    // A seller the token leaves out was never in that supply: the holders still earn, and the contract charges it.
    state.excluded[CREATOR.toLowerCase()] = true;
    state.simulated = sellQuote(curve, all, 200, 100).netEthOut;
    const excluded = await buildTrade(TONK_TESTNET, { ...SELL, amount: String(all) });
    expect(excluded).toMatchObject({ step: "trade", quote: { crewFee: String(sellQuote(curve, all, 200, 100).crewFee) } });
  });

  it("after a confirmed approval, builds the sale no earlier than that approval's block, waiting out a lagging read", async () => {
    const state = chain();
    state.allowance = big(SELL.amount);
    state.simulated = SOLD_FOR;
    const client = connect(state);
    const approvedAt = state.block + big(2);
    client.getTransactionReceipt.mockResolvedValue(approvalReceipt(approvedAt, big(SELL.amount)));
    // The RPC's head lags behind the receipt for a moment.
    client.getBlockNumber.mockResolvedValueOnce(state.block).mockResolvedValueOnce(state.block + big(1)).mockResolvedValue(approvedAt);
    const pending = buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL });
    await vi.advanceTimersByTimeAsync(3_000);
    const build = await pending;
    expect(build.step).toBe("trade");
    expect(client.getTransactionReceipt).toHaveBeenCalledWith({ hash: APPROVAL });
    expect(client.getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "sell", blockNumber: approvedAt }));
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "allowance", blockNumber: approvedAt }));
  });

  it("asks again for an approval receipt a lagging replica can't show yet, and refuses a wrong one at the first read", async () => {
    const state = chain();
    state.allowance = big(SELL.amount);
    state.simulated = SOLD_FOR;
    const client = connect(state);
    // Astra's probe: the first read fails, the next can't find it yet, the third has it.
    client.getTransactionReceipt.mockRejectedValueOnce(new Error("socket hang up")).mockRejectedValueOnce(new Error("not found")).mockResolvedValue(approvalReceipt(state.block, big(SELL.amount)));
    const pending = buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL });
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toMatchObject({ step: "trade" });
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(3);
    // A receipt that is there but isn't this sale's approval: refused at once, not asked again.
    client.getTransactionReceipt.mockReset().mockResolvedValue({ ...approvalReceipt(state.block, big(SELL.amount)), status: "reverted" });
    await expect(buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL })).rejects.toMatchObject({ code: "unavailable" });
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(1);
    // Never readable: it gives up after a few tries, having built nothing.
    client.getTransactionReceipt.mockReset().mockRejectedValue(new Error("down"));
    const gone = buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL });
    const refused = expect(gone).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(5_000);
    await refused;
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(4);
  });

  it("refuses to lean on an approval that isn't this sale's, or a chain that never reaches it", async () => {
    const state = chain();
    const client = connect(state);
    client.getTransactionReceipt.mockResolvedValue(approvalReceipt(state.block, big(SELL.amount) - big(1)));
    await expect(buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL })).rejects.toMatchObject({ code: "unavailable" });
    client.getTransactionReceipt.mockResolvedValue({ ...approvalReceipt(state.block, big(SELL.amount)), from: BUYER });
    await expect(buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL })).rejects.toMatchObject({ code: "unavailable" });
    client.getTransactionReceipt.mockResolvedValue(approvalReceipt(state.block + big(50), big(SELL.amount)));
    const stuck = buildTrade(TONK_TESTNET, { ...SELL, approval: APPROVAL });
    const settled = expect(stuck).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("sells inside the launch-block shield (it only taxes buys), and refuses what the wallet doesn't hold", async () => {
    const state = chain();
    state.block = state.launchBlock;
    connect(state);
    expect(await buildTrade(TONK_TESTNET, SELL)).toMatchObject({ step: "approve" });
    await expect(buildTrade(TONK_TESTNET, { ...SELL, trader: BUYER })).rejects.toMatchObject({ code: "tokens" });
    await expect(buildTrade(TONK_TESTNET, { ...SELL, minOut: String(SOLD_FOR + big(1)) })).resolves.toMatchObject({ step: "moved" });
  });
});

const CLAIM: ActionRequest = { kind: "claim", token: TOKEN, owner: CREATOR };

describe("an action request", () => {
  it("passes each kind, and refuses a short extension or an unknown kind", () => {
    expect(parseActionRequest(CLAIM)).toEqual(CLAIM);
    expect(parseActionRequest({ kind: "withdraw", owner: BUYER })).toEqual({ kind: "withdraw", owner: BUYER });
    expect(parseActionRequest({ kind: "extend", token: TOKEN, owner: CREATOR, days: 7 })).toMatchObject({ days: 7 });
    expect(parseActionRequest({ kind: "edit", token: TOKEN, owner: CREATOR, description: "New words.", x: "@tonkfun", telegram: "", website: "", agent: null })).toMatchObject({ kind: "edit", description: "New words." });
    for (const body of [{ ...CLAIM, owner: "x" }, { ...CLAIM, kind: "burn" }, { kind: "extend", token: TOKEN, owner: CREATOR, days: 6 }, { kind: "extend", token: TOKEN, owner: CREATOR, days: 3651 }, { kind: "extend", token: TOKEN, owner: CREATOR, days: 7.5 }, { kind: "edit", token: TOKEN, owner: CREATOR, description: "y".repeat(281), x: "", telegram: "", website: "", agent: null }, null]) {
      expect(() => parseActionRequest(body)).toThrow(TonkError);
    }
  });
});

describe("building the creator's and the holder's actions", () => {
  const call = async (request: ActionRequest, change: (state: Chain) => void = () => undefined) => {
    const state = chain();
    change(state);
    const client = connect(state);
    return { build: await buildAction(TONK_TESTNET, request), client };
  };

  it("claims what has unlocked, simulated from the creator first", async () => {
    const { build, client } = await call(CLAIM);
    expect(build.tx).toMatchObject({ to: PAD, value: "0", gas: "167700" });
    expect(decodeFunctionData({ abi: LAUNCHPAD_ABI, data: build.tx.data as `0x${string}` })).toMatchObject({ functionName: "claimDevTokens", args: [TOKEN] });
    expect(client.call).toHaveBeenCalledWith(expect.objectContaining({ account: CREATOR, to: PAD }));
  });

  it("extends the lock by whole days, and stores an edit as the app's own JSON", async () => {
    const extend = await call({ kind: "extend", token: TOKEN, owner: CREATOR, days: 7 });
    expect(decodeFunctionData({ abi: LAUNCHPAD_ABI, data: extend.build.tx.data as `0x${string}` })).toMatchObject({ functionName: "extendDevLock", args: [TOKEN, big(7 * DAY)] });

    const agent = { name: "Commander Astro", role: "Mission commander", voice: "hype" as const, brief: "Keep holders informed." };
    const edit = await call({ kind: "edit", token: TOKEN, owner: CREATOR, description: "New words.", x: "@tonkfun", telegram: "t.me/tonkfun", website: "tonkfun.fun", image: "", agent });
    const { functionName, args } = decodeFunctionData({ abi: LAUNCHPAD_ABI, data: edit.build.tx.data as `0x${string}` });
    expect(functionName).toBe("updateMissionMetadata");
    expect(decodeMetadata(String(args?.[1]))).toEqual({ description: "New words.", x: "tonkfun", telegram: "https://t.me/tonkfun", website: "https://tonkfun.fun/", image: "" });
    expect(decodeAgent(String(args?.[2]))).toEqual(agent);
  });

  it("claims a holder's rewards from the token, and withdraws ETH the launchpad is holding", async () => {
    const rewards = await call({ kind: "rewards", token: TOKEN, owner: BUYER }, (state) => void (state.unpaidRewards = big(7)));
    expect(rewards.build.tx.to).toBe(TOKEN);
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: rewards.build.tx.data as `0x${string}` }).functionName).toBe("sweepMyCrewRewards");
    const withdraw = await call({ kind: "withdraw", owner: BUYER }, (state) => void (state.unpaidEth = big(9)));
    expect(withdraw.build.tx.to).toBe(PAD);
    expect(decodeFunctionData({ abi: LAUNCHPAD_ABI, data: withdraw.build.tx.data as `0x${string}` }).functionName).toBe("withdrawAccruedEth");
  });

  it.each([
    ["a claim by anyone but the creator", { ...CLAIM, owner: BUYER } as ActionRequest, () => undefined, "forbidden"],
    ["an edit by anyone but the creator", { kind: "edit", token: TOKEN, owner: BUYER, description: "", x: "", telegram: "", website: "", agent: null } as ActionRequest, () => undefined, "forbidden"],
    ["a claim before anything has unlocked", CLAIM, (state: Chain) => void (state.lock = [1, 8000, big(LAUNCHED), big(LAUNCHED + 180 * DAY), big(1000), big(0)]), "nothing"],
    ["a claim on a token with no lock", CLAIM, (state: Chain) => void (state.lock = [0, 0, big(0), big(0), big(0), big(0)]), "nothing"],
    ["an extension of a vest that has fully unlocked", { kind: "extend", token: TOKEN, owner: CREATOR, days: 7 } as ActionRequest, (state: Chain) => void (state.lock = [2, 8000, big(LAUNCHED - 200 * DAY), big(LAUNCHED - 20 * DAY), big(1000), big(0)]), "nothing"],
    ["a reward claim with nothing unpaid", { kind: "rewards", token: TOKEN, owner: BUYER } as ActionRequest, () => undefined, "nothing"],
    ["a withdrawal with nothing held", { kind: "withdraw", owner: BUYER } as ActionRequest, () => undefined, "nothing"],
    ["an action the contract reverts", CLAIM, (state: Chain) => void (state.callFails = reverted(LAUNCHPAD_ABI, "Tonkpad: nothing to claim")), "refused"],
    ["an action the wallet can't pay the gas for", CLAIM, (state: Chain) => void (state.eth = big(1)), "funds"],
    ["an action on an address that isn't a mission", CLAIM, (state: Chain) => void (state.mission = false), "missing"],
  ] as [string, ActionRequest, (state: Chain) => void, string][])("refuses %s", async (_, request, change, code) => {
    await expect(call(request, change)).rejects.toMatchObject({ code });
  });
});

/** A log as a node returns it, for an event of the launchpad or a token. */
function log<Abi extends typeof LAUNCHPAD_ABI | typeof TOKEN_ABI>(address: string, abi: Abi, eventName: string, indexed: Record<string, unknown>, data: unknown[]): Log {
  const event = (abi as readonly { type: string; name?: string; inputs?: readonly { indexed?: boolean }[] }[]).find((entry) => entry.type === "event" && entry.name === eventName);
  if (!event?.inputs) throw new Error(`no event ${eventName}`);
  return {
    address: address as `0x${string}`,
    topics: encodeEventTopics({ abi, eventName, args: indexed } as never) as Log["topics"],
    data: encodeAbiParameters(event.inputs.filter((input) => !input.indexed) as never, data as never),
    blockHash: `0x${"0".repeat(64)}`,
    blockNumber: big(151_330_000),
    logIndex: 0,
    transactionHash: `0x${"1".repeat(64)}`,
    transactionIndex: 0,
    removed: false,
  };
}

describe("what a confirmed transaction did", () => {
  const trade = (address: string) => log(address, LAUNCHPAD_ABI, "CurveTrade", { token: TOKEN, trader: BUYER }, [false, big(1000), big(5000), big(10), big(20), big(10), big(1), big(1), big(1)]);

  it("reads the launchpad's own events: a trade, a graduation, a claim, an extension, an edit, a withdrawal", () => {
    const logs = [
      trade(PAD),
      log(PAD, LAUNCHPAD_ABI, "MissionGraduated", { token: TOKEN, dexPoolOrPosition: ZERO }, [big(1), big(2), big(3)]),
      log(PAD, LAUNCHPAD_ABI, "DevTokensClaimed", { token: TOKEN, creator: CREATOR }, [big(551_121)]),
      log(PAD, LAUNCHPAD_ABI, "LockExtended", { token: TOKEN, creator: CREATOR }, [big(LAUNCHED + 187 * DAY)]),
      log(PAD, LAUNCHPAD_ABI, "MetadataUpdated", { token: TOKEN }, ["{}", ""]),
      log(PAD, LAUNCHPAD_ABI, "FallbackEthWithdrawn", { recipient: BUYER }, [big(9)]),
    ];
    expect(txEvents(TONK_TESTNET, logs)).toEqual([
      { kind: "trade", token: TOKEN, trader: BUYER, side: "sell", eth: "1000", tokens: "5000", protocolFee: "10", crewFee: "20", creatorFee: "10" },
      { kind: "graduated", token: TOKEN },
      { kind: "claimed", token: TOKEN, amount: "551121" },
      { kind: "extended", token: TOKEN, lockEnd: LAUNCHED + 187 * DAY },
      { kind: "edited", token: TOKEN },
      { kind: "withdrawn", recipient: BUYER, amount: "9" },
    ]);
  });

  it("reads a token's reward payments and approvals to the launchpad, and nothing from an impostor", () => {
    const impostor = "0x2222222222222222222222222222222222222222";
    const logs = [
      log(TOKEN, TOKEN_ABI, "CrewRewardPaid", { holder: CREATOR }, [big(1_000_000_000_000)]),
      log(TOKEN, TOKEN_ABI, "Approval", { owner: CREATOR, spender: PAD }, [big(77)]),
      // An approval to anyone else is not the sell's approval.
      log(TOKEN, TOKEN_ABI, "Approval", { owner: CREATOR, spender: impostor }, [big(88)]),
      // The launchpad's event from another contract is not the launchpad's.
      trade(impostor),
    ];
    expect(txEvents(TONK_TESTNET, logs)).toEqual([
      { kind: "rewards", token: TOKEN, holder: CREATOR, amount: "1000000000000" },
      { kind: "approved", token: TOKEN, owner: CREATOR, amount: "77" },
    ]);
  });
});

describe("the Crew floor", () => {
  it("reads the token's floor with the mission; an earlier build without it reads 1, and a failed read is an error", async () => {
    const state = chain();
    connect(state);
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ crewFloor: "10000000000000000000000000" });
    clearCache();
    state.crewFloor = new BaseError("reverted", { cause: new ContractFunctionRevertedError({ abi: TOKEN_ABI, functionName: "CREW_ELIGIBLE_FLOOR", message: "execution reverted" }) });
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ crewFloor: "1" });
    clearCache();
    state.crewFloor = new Error("socket hang up");
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("takes a provider's -32000 'execution reverted' for the earlier build too, but never an HTTP failure", async () => {
    const state = chain();
    connect(state);
    state.crewFloor = new BaseError("call failed", { cause: new ExecutionRevertedError({ message: "execution reverted" }) });
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ crewFloor: "1" });
    clearCache();
    state.crewFloor = new BaseError("call failed", { cause: new HttpRequestError({ url: "https://rpc.invalid", status: 503 }) });
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("a pause, on builds with and without patch A", () => {
  it("reads from the contract whether a paused launchpad still takes sells", async () => {
    const state = chain();
    const client = connect(state);
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ paused: false, sellingOpen: true });
    expect(client.simulateContract).not.toHaveBeenCalled();
    clearCache();
    state.paused = true;
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ paused: true, sellingOpen: false });
    clearCache();
    state.pausedSells = true;
    await expect(readMission(TONK_TESTNET, TOKEN, 0)).resolves.toMatchObject({ paused: true, sellingOpen: true });
  });

  it("while paused refuses buys always, and sells only where the contract stops them too", async () => {
    const state = chain();
    state.paused = true;
    connect(state);
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "paused" });
    await expect(buildTrade(TONK_TESTNET, SELL)).rejects.toMatchObject({ code: "paused" });
    state.pausedSells = true;
    await expect(buildTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "paused" });
    expect(await buildTrade(TONK_TESTNET, SELL)).toMatchObject({ step: "approve" });
  });
});
