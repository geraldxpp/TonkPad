import { BaseError, decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, type Log } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mainnetNetwork, TONK_TESTNET } from "@/shared/tonk/networks";
import { TOKEN_ABI } from "@/shared/tonk/server/abi";
import { tonkClient } from "@/shared/tonk/server/client";
import { buildPoolTrade, parsePoolTradeRequest, PERMIT2_ABI, POOL_MANAGER_ABI, type PoolKey, poolIdOf, quotePool, ROUTER_ABI, swapInput } from "@/shared/tonk/server/pool";
import { buildAction, parseActionRequest } from "@/shared/tonk/server/action";
import { MIGRATOR_ABI } from "@/shared/tonk/server/pool-key";
import { txEvents } from "@/shared/tonk/server/status";
import VECTORS from "./fixtures/pool-vectors.json";

vi.mock("@/shared/tonk/server/client", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/server/client")>()), tonkClient: vi.fn() }));

const big = (value: number | string) => BigInt(value);
const ZERO = "0x0000000000000000000000000000000000000000";
const TOKEN = "0x1111111111111111111111111111111111111111";
const GUARD = "0x2222222222222222222222222222222222222000";
const TRADER = "0x3333333333333333333333333333333333333333";
const MAINNET = mainnetNetwork({ launchpad: `0x${"a".repeat(40)}`, migrator: `0x${"b".repeat(40)}`, block: "1" });
if (!MAINNET?.uniswap) throw new Error("the mainnet fixture should connect");
const NETWORK = MAINNET;
const UNISWAP = MAINNET.uniswap;
const KEY: PoolKey = { currency0: ZERO, currency1: TOKEN, fee: 40_000, tickSpacing: 60, hooks: GUARD };

describe("the router's swap input", () => {
  it("is byte for byte what Foundry's cast encodes for the same buy and sell, and the pool id matches", () => {
    expect(swapInput(KEY, true, big("1000000000000000"), big(123_456_789))).toBe(VECTORS.buy);
    expect(swapInput(KEY, false, big("5000000000000000000000000"), big(7))).toBe(VECTORS.sell);
    expect(poolIdOf(KEY)).toBe(VECTORS.id);
  });

  it("calls execute with V4_SWAP and that one input, like cast's calldata", () => {
    const { functionName, args } = decodeFunctionData({ abi: ROUTER_ABI, data: VECTORS.execute as `0x${string}` });
    expect(functionName).toBe("execute");
    expect(args).toEqual(["0x10", [VECTORS.buy], big(1_800_000_000)]);
  });
});

/** A chain the pool code reads from: a graduated, open pool unless a test changes it. */
function chain() {
  return {
    block: big(111_000_000),
    timestamp: big(1_800_000_000),
    initialized: true,
    graduated: true,
    known: true,
    quoted: big(40_000_000),
    held: big("5000000000000000000000000"),
    tokenAllowance: big(0),
    permit2: [big(0), 0, 0] as [bigint, number, number],
    eth: big(10) ** big(18),
    proof: null as unknown,
    /** The receipt of an approval the wallet confirmed, when a build names one; heads the chain reports, one per read. */
    receipt: null as { status: string; from: string; to: string; blockNumber: bigint } | null,
    /** Reads of that receipt the RPC answers with "not found" before it has it. */
    receiptLag: 0,
    heads: [] as bigint[],
    /** The migrator's guard, and what the guard says it serves; and what the migrator's key says beyond the true one. */
    guard: GUARD as string,
    guardMigrator: NETWORK.migrator as string,
    guardManager: UNISWAP.poolManager as string,
    keyPatch: {} as Partial<PoolKey>,
  };
}
type Chain = ReturnType<typeof chain>;

function fakeClient(state: Chain) {
  const readContract = vi.fn(async ({ functionName, args, address }: { functionName: string; args?: readonly unknown[]; address: string }) => {
    switch (functionName) {
      case "lockedPositions":
        return [TOKEN, TRADER, big(7), 200, 100, 40_000, big(0), big(0), state.initialized];
      case "missions":
        return [state.known ? TOKEN : ZERO, TRADER, big(0), big(0), 200, 100, state.graduated, big(0), big(0), big(0), big(0), ZERO, "", ""];
      case "poolKey":
        return { ...KEY, fee: Number(args?.[1]), ...state.keyPatch };
      case "initializationGuard":
        return state.guard;
      case "migrator":
        return state.guardMigrator;
      case "poolManager":
        return state.guardManager;
      case "balanceOf":
        return state.held;
      case "allowance":
        return address.toLowerCase() === UNISWAP.permit2 ? state.permit2 : state.tokenAllowance;
      default:
        throw new Error(`unexpected read ${functionName}`);
    }
  });
  return {
    readContract,
    getBlockNumber: vi.fn(async () => state.heads.shift() ?? state.block),
    getTransactionReceipt: vi.fn(async () => {
      if (state.receiptLag > 0) {
        state.receiptLag -= 1;
        throw new Error("receipt not found");
      }
      if (!state.receipt) throw new Error("no receipt");
      return state.receipt;
    }),
    getBlock: vi.fn(async () => ({ timestamp: state.timestamp })),
    simulateContract: vi.fn(async () => ({ result: [state.quoted, big(150_000)] })),
    call: vi.fn(async (request: { data: `0x${string}`; blockNumber?: bigint; value?: bigint }) => {
      void request;
      if (state.proof) throw state.proof;
      return { data: "0x" };
    }),
    estimateGas: vi.fn(async () => big(200_000)),
    getBalance: vi.fn(async () => state.eth),
    getGasPrice: vi.fn(async () => big(10_000_000)),
  };
}
function connect(state: Chain) {
  const client = fakeClient(state);
  vi.mocked(tonkClient).mockResolvedValue(client as never);
  return client;
}

const BUY = { token: TOKEN, trader: TRADER, side: "buy" as const, amount: "1000000000000000", minOut: "39000000" };
const SELL = { token: TOKEN, trader: TRADER, side: "sell" as const, amount: "5000000000000000000000000", minOut: "1" };

describe("building a pool trade", () => {
  beforeEach(() => vi.mocked(tonkClient).mockReset());

  it("builds a buy that pays exactly the ETH in, proven at the quote's own block with the quote as its minimum", async () => {
    const state = chain();
    const client = connect(state);
    const build = await buildPoolTrade(NETWORK, BUY);
    if (build.step !== "trade") throw new Error(`built ${build.step}`);
    expect(build.quote).toMatchObject({ pool: VECTORS.id, side: "buy", out: "40000000", feeBps: 400, block: 111_000_000 });
    expect(build.tx).toMatchObject({ to: UNISWAP.universalRouter, value: BUY.amount, gas: "260000" });
    const sent = decodeFunctionData({ abi: ROUTER_ABI, data: build.tx.data as `0x${string}` });
    expect(sent.args).toEqual(["0x10", [swapInput(KEY, true, big(BUY.amount), big(BUY.minOut))], state.timestamp + big(600)]);
    const [proof] = client.call.mock.calls[0];
    expect(proof.blockNumber).toBe(state.block);
    expect(proof.value).toBe(big(BUY.amount));
    expect(decodeFunctionData({ abi: ROUTER_ABI, data: proof.data }).args[1]).toEqual([swapInput(KEY, true, big(BUY.amount), state.quoted)]);
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ address: UNISWAP.quoter, functionName: "quoteExactInputSingle", blockNumber: state.block }));
  });

  it("stops before the wallet when the quote fell under the trader's minimum", async () => {
    const state = chain();
    state.quoted = big(38_000_000);
    const client = connect(state);
    expect(await buildPoolTrade(NETWORK, BUY)).toEqual({ step: "moved", quote: expect.objectContaining({ out: "38000000" }) });
    expect(client.call).not.toHaveBeenCalled();
  });

  it("has a sell approve Permit2 for exactly the amount, then allow the router exactly that for thirty minutes, then swap", async () => {
    const state = chain();
    connect(state);
    const first = await buildPoolTrade(NETWORK, SELL);
    if (first.step !== "approve") throw new Error(`built ${first.step}`);
    expect(first.tx).toMatchObject({ to: TOKEN, value: "0" });
    expect(decodeFunctionData({ abi: TOKEN_ABI, data: first.tx.data as `0x${string}` }).args).toEqual([getAddress(UNISWAP.permit2), big(SELL.amount)]);

    state.tokenAllowance = big(SELL.amount);
    const second = await buildPoolTrade(NETWORK, SELL);
    if (second.step !== "allow") throw new Error(`built ${second.step}`);
    expect(second.tx).toMatchObject({ to: UNISWAP.permit2, value: "0" });
    expect(decodeFunctionData({ abi: PERMIT2_ABI, data: second.tx.data as `0x${string}` }).args).toEqual([getAddress(TOKEN), getAddress(UNISWAP.universalRouter), big(SELL.amount), 1_800_001_800]);

    // An allowance that runs out before the swap's deadline is asked for again.
    state.permit2 = [big(SELL.amount), 1_800_000_300, 1];
    expect((await buildPoolTrade(NETWORK, SELL)).step).toBe("allow");

    state.permit2 = [big(SELL.amount), 1_800_001_800, 1];
    const third = await buildPoolTrade(NETWORK, SELL);
    if (third.step !== "trade") throw new Error(`built ${third.step}`);
    expect(third.tx).toMatchObject({ to: UNISWAP.universalRouter, value: "0" });
    expect(decodeFunctionData({ abi: ROUTER_ABI, data: third.tx.data as `0x${string}` }).args[1]).toEqual([swapInput(KEY, false, big(SELL.amount), big(SELL.minOut))]);
  });

  it.each([
    ["more tokens than the wallet holds", (state: Chain) => void (state.held = big(1)), "tokens"],
    ["a pool that hasn't opened after graduation", (state: Chain) => void (state.initialized = false), "pending"],
    ["a token still on its curve", (state: Chain) => void Object.assign(state, { initialized: false, graduated: false }), "curve"],
    ["an address the launchpad doesn't know", (state: Chain) => void Object.assign(state, { initialized: false, known: false }), "missing"],
    ["a swap the router refuses at that block", (state: Chain) => void (state.proof = new BaseError("execution reverted")), "refused"],
    ["a wallet short of ETH for the swap and its gas", (state: Chain) => void (state.eth = big(1)), "funds"],
  ] as [string, (state: Chain) => void, string][])("refuses %s", async (_, change, code) => {
    const state = chain();
    state.tokenAllowance = big(SELL.amount);
    state.permit2 = [big(SELL.amount), 1_800_001_800, 1];
    change(state);
    connect(state);
    await expect(buildPoolTrade(NETWORK, code === "tokens" ? SELL : BUY)).rejects.toMatchObject({ code });
  });

  it("is closed where graduated pools don't trade: the testnet has no router", async () => {
    connect(chain());
    await expect(buildPoolTrade(TONK_TESTNET, BUY)).rejects.toMatchObject({ code: "closed", status: 404 });
    await expect(quotePool(TONK_TESTNET, TOKEN, "buy", big(1))).rejects.toMatchObject({ code: "closed" });
  });

  it("quotes from V4Quoter at one block without building anything", async () => {
    const client = connect(chain());
    expect(await quotePool(NETWORK, TOKEN, "sell", big(5))).toEqual({ pool: VECTORS.id, side: "sell", amountIn: "5", out: "40000000", feeBps: 400, block: 111_000_000 });
    expect(client.call).not.toHaveBeenCalled();
  });
});

/** A Swap log as a node returns it. */
function swapLog(address: string, amount0: bigint, amount1: bigint): Log {
  return {
    address: address as `0x${string}`,
    topics: encodeEventTopics({ abi: POOL_MANAGER_ABI, eventName: "Swap", args: { id: VECTORS.id as `0x${string}`, sender: UNISWAP.universalRouter } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "int128" }, { type: "int128" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }, { type: "uint24" }], [amount0, amount1, big(1), big(1), 0, 40_000]),
    blockHash: `0x${"0".repeat(64)}`,
    blockNumber: big(1),
    logIndex: 0,
    transactionHash: `0x${"1".repeat(64)}`,
    transactionIndex: 0,
    removed: false,
  };
}

describe("only the migrator's own guarded pool", () => {
  beforeEach(() => vi.mocked(tonkClient).mockReset());
  const OTHER = `0x${"9".repeat(40)}` as const;

  it("quotes and builds nothing on a look-alike key: another hook, tick spacing, fee or pair", async () => {
    // A hook with the guard's flags but another address: someone else's pool for the same token.
    const LOOK_ALIKE = "0x4444444444444444444444444444444444442000";
    for (const keyPatch of [{ hooks: LOOK_ALIKE }, { tickSpacing: 10 }, { fee: 3_000 }, { currency1: OTHER }, { currency0: TOKEN }] satisfies Partial<PoolKey>[]) {
      const state = chain();
      state.keyPatch = keyPatch;
      const client = connect(state);
      await expect(quotePool(NETWORK, TOKEN, "buy", big(1_000))).rejects.toMatchObject({ code: "refused" });
      await expect(buildPoolTrade(NETWORK, BUY)).rejects.toMatchObject({ code: "refused" });
      expect(client.simulateContract).not.toHaveBeenCalled();
      expect(client.call).not.toHaveBeenCalled();
    }
  });

  it("refuses a guard with any other hook flag, or one serving another migrator or PoolManager", async () => {
    for (const patch of [{ guard: "0x2222222222222222222222222222222222222080" }, { guard: "0x2222222222222222222222222222222222220000" }, { guardMigrator: OTHER }, { guardManager: OTHER }]) {
      const state = { ...chain(), ...patch };
      // The key names whatever the migrator calls its guard, so only the guard's own checks can refuse it.
      state.keyPatch = { hooks: state.guard as `0x${string}` };
      const client = connect(state);
      await expect(quotePool(NETWORK, TOKEN, "buy", big(1_000))).rejects.toMatchObject({ code: "refused" });
      expect(client.simulateContract).not.toHaveBeenCalled();
    }
  });

  it("checks the guard once, then trusts it: its migrator and PoolManager never change", async () => {
    const client = connect(chain());
    await quotePool(NETWORK, TOKEN, "buy", big(1_000));
    await quotePool(NETWORK, TOKEN, "sell", big(5));
    const asked = (name: string) => client.readContract.mock.calls.filter(([request]) => request.functionName === name).length;
    expect([asked("initializationGuard"), asked("migrator"), asked("poolManager"), asked("poolKey")]).toEqual([1, 1, 1, 2]);
  });
});

describe("a pool sale after its approval", () => {
  const APPROVAL = `0x${"ab".repeat(32)}`;

  it("reads the chain no earlier than the confirmed approval's block, however far behind the RPC starts", async () => {
    const state = chain();
    state.tokenAllowance = big(SELL.amount);
    state.permit2 = [big(SELL.amount), 1_800_001_800, 1];
    state.receipt = { status: "success", from: TRADER, to: UNISWAP.permit2, blockNumber: big(111_000_005) };
    // The RPC is three blocks behind at first, then catches up.
    state.heads = [big(111_000_002), big(111_000_005)];
    const client = connect(state);
    const build = await buildPoolTrade(NETWORK, { ...SELL, approval: APPROVAL });
    expect(build.step).toBe("trade");
    expect(client.getBlockNumber).toHaveBeenCalledTimes(2);
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: big(111_000_005) }));
  });

  it("waits out a receipt the RPC doesn't have yet, then builds the sale", async () => {
    vi.useFakeTimers();
    try {
      const state = chain();
      state.tokenAllowance = big(SELL.amount);
      state.permit2 = [big(SELL.amount), 1_800_001_800, 1];
      state.receipt = { status: "success", from: TRADER, to: TOKEN, blockNumber: big(111_000_000) };
      state.receiptLag = 2;
      const client = connect(state);
      const pending = buildPoolTrade(NETWORK, { ...SELL, approval: APPROVAL });
      await vi.runAllTimersAsync();
      expect((await pending).step).toBe("trade");
      expect(client.getTransactionReceipt).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a receipt that never shows after a first read and three more, and builds nothing", async () => {
    vi.useFakeTimers();
    try {
      const state = chain();
      const client = connect(state);
      const refused = expect(buildPoolTrade(NETWORK, { ...SELL, approval: APPROVAL })).rejects.toMatchObject({ code: "unavailable" });
      await vi.runAllTimersAsync();
      await refused;
      expect(client.getTransactionReceipt).toHaveBeenCalledTimes(4);
      expect(client.call).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses at once an approval that isn't this trader's, to the token or Permit2, or that failed", async () => {
    for (const receipt of [
      { status: "success", from: `0x${"9".repeat(40)}`, to: UNISWAP.permit2, blockNumber: big(1) },
      { status: "success", from: TRADER, to: `0x${"9".repeat(40)}`, blockNumber: big(1) },
      { status: "reverted", from: TRADER, to: TOKEN, blockNumber: big(1) },
    ]) {
      const state = chain();
      state.receipt = receipt;
      const client = connect(state);
      await expect(buildPoolTrade(NETWORK, { ...SELL, approval: APPROVAL })).rejects.toMatchObject({ code: "unavailable" });
      expect(client.getTransactionReceipt).toHaveBeenCalledTimes(1);
    }
    expect(() => parsePoolTradeRequest({ ...SELL, approval: "0x12" })).toThrow();
    expect(parsePoolTradeRequest({ ...SELL, approval: APPROVAL }).approval).toBe(APPROVAL);
    expect(parsePoolTradeRequest(SELL).approval).toBeNull();
  });
});

describe("a pool trade's receipt", () => {
  it("reads the PoolManager's own Swap: a buy pays ETH in and takes tokens out, a sell the reverse", () => {
    expect(txEvents(NETWORK, [swapLog(UNISWAP.poolManager, big(-1_000), big(40_000))])).toEqual([{ kind: "pool", pool: VECTORS.id, side: "buy", eth: "1000", tokens: "40000" }]);
    expect(txEvents(NETWORK, [swapLog(UNISWAP.poolManager, big(990), big(-40_000))])).toEqual([{ kind: "pool", pool: VECTORS.id, side: "sell", eth: "990", tokens: "40000" }]);
  });

  it("ignores the same event from any other contract, and pools where none trade", () => {
    expect(txEvents(NETWORK, [swapLog(`0x${"9".repeat(40)}`, big(-1_000), big(40_000))])).toEqual([]);
    expect(txEvents(TONK_TESTNET, [swapLog(UNISWAP.poolManager, big(-1_000), big(40_000))])).toEqual([]);
  });
});

describe("sharing a graduated pool's fees", () => {
  beforeEach(() => vi.mocked(tonkClient).mockReset());
  const SHARE = { kind: "share" as const, token: TOKEN, owner: TRADER };

  it("builds the migrator's own distributePostGradRewards for any wallet, simulated from it first", async () => {
    expect(parseActionRequest(SHARE)).toEqual(SHARE);
    const client = connect(chain());
    const build = await buildAction(NETWORK, SHARE);
    expect(build.tx).toMatchObject({ to: NETWORK.migrator, value: "0", data: encodeFunctionData({ abi: MIGRATOR_ABI, functionName: "distributePostGradRewards", args: [TOKEN] }) });
    expect(client.call).toHaveBeenCalledWith(expect.objectContaining({ account: TRADER, to: NETWORK.migrator }));
  });

  it("is refused where pools don't trade, before graduation, and on anything but the guarded pool", async () => {
    connect(chain());
    await expect(buildAction(TONK_TESTNET, SHARE)).rejects.toMatchObject({ code: "closed" });
    for (const [patch, code] of [
      [{ initialized: false, graduated: false }, "curve"],
      [{ keyPatch: { hooks: "0x4444444444444444444444444444444444442000" } }, "refused"],
    ] as const) {
      const client = connect({ ...chain(), ...patch } as Chain);
      await expect(buildAction(NETWORK, SHARE)).rejects.toMatchObject({ code });
      expect(client.call).not.toHaveBeenCalled();
    }
  });

  it("reads what was shared from the migrator's own event, and from no other contract", () => {
    const log = (address: string): Log => ({
      address: address as `0x${string}`,
      topics: encodeEventTopics({ abi: MIGRATOR_ABI, eventName: "PostGradRewardsDistributed", args: { token: TOKEN } }) as Log["topics"],
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [big(25), big(0), big(5), big(1_000)]),
      blockHash: `0x${"0".repeat(64)}`,
      blockNumber: big(1),
      logIndex: 0,
      transactionHash: `0x${"1".repeat(64)}`,
      transactionIndex: 0,
      removed: false,
    });
    expect(txEvents(NETWORK, [log(NETWORK.migrator)])).toEqual([{ kind: "shared", token: getAddress(TOKEN), protocolEth: "25", crewEth: "0", creatorEth: "5", tokensBurned: "1000" }]);
    expect(txEvents(NETWORK, [log(TOKEN)])).toEqual([]);
  });
});

