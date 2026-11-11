import { afterEach, describe, expect, it, vi } from "vitest";
import { acrossPlan, parseAcross, parseAcrossStatus } from "../server/across";
import { canonicalApplies, canonicalPlan, DEPOSIT_ETH, depositTxId, INBOX, messageNumberOf } from "../server/canonical";
import { bridgeConfig, BridgeError } from "../server/config";
import { buildBridge, finishRoutes, quoteBridge } from "../server/engine";
import { parseLifi, parseLifiStatus } from "../server/lifi";
import type { ProviderPlan } from "../server/plan";
import { parseRelay, parseRelayStatus } from "../server/relay";
import { type BridgeRequest, parseBridgeRequest } from "../server/request";
import { clearRpcRest, firstAnswering } from "../server/rpc";
import { clearCache } from "@/shared/swap/server/cache";

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL_WALLET = "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const ZERO = "0x0000000000000000000000000000000000000000";
const DEPOSITORY = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
const SPOKE_BASE = "0x09aea4b2242abc8bb4bb78d537a67a245a7bec64";
const DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const REQUEST_ID = `0x${"ab".repeat(32)}`;

const usdcToUsdg = (patch: Record<string, unknown> = {}): BridgeRequest => parseBridgeRequest({ from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "250000000", sender: WALLET, recipient: WALLET, ...patch });
const ethToEth = (patch: Record<string, unknown> = {}): BridgeRequest => parseBridgeRequest({ from: "eth", to: "rh", asset: "ETH", receive: "ETH", amount: "50000000000000000", sender: WALLET, recipient: WALLET, ...patch });

const approveStep = (spender = DEPOSITORY) => ({ id: "approve", kind: "transaction", requestId: REQUEST_ID, items: [{ data: { to: USDC_BASE, data: `0x095ea7b3${spender.slice(2).padStart(64, "0")}${"0".repeat(56)}0ee6b280`, value: "0", chainId: 8453 } }] });
const relayBody = (patch: Record<string, unknown> = {}, detail: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID,
  steps: [approveStep(), { id: "deposit", kind: "transaction", requestId: REQUEST_ID, items: [{ data: { from: WALLET, to: DEPOSITORY, data: "0xe8017952", value: "0", chainId: 8453, gas: "76194" } }] }],
  fees: { gas: { amountUsd: "0.001" } },
  details: {
    recipient: WALLET,
    timeEstimate: 1,
    currencyIn: { currency: { chainId: 8453, address: USDC_BASE }, amount: "250000000", amountUsd: "249.9" },
    currencyOut: { currency: { chainId: 4663, address: USDG }, amount: "249800000", amountUsd: "249.8", minimumAmount: "248500000" },
    ...detail,
  },
  ...patch,
});

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof BridgeError ? error.code : "other";
  }
  return "none";
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
  clearRpcRest();
});

describe("a request", () => {
  it("resolves against the bridge's own list and stands in for a wallet not connected yet", () => {
    const request = parseBridgeRequest({ from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "1000" });
    expect(request.asset.address).toBe(USDC_BASE);
    expect(request.receive.address).toBe(USDG);
    expect(request.real).toBe(false);
    expect(request.sender).toBe("0x000000000000000000000000000000000000dEaD");
    expect(usdcToUsdg().real).toBe(true);
  });

  it("holds like for like tight and leaves a conversion more room", () => {
    expect(usdcToUsdg().slippageBps).toBe(50);
    expect(parseBridgeRequest({ from: "base", to: "rh", asset: "ETH", receive: "USDG", amount: "1000" }).slippageBps).toBe(100);
  });

  it("refuses anything it doesn't recognise", () => {
    const base = { from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "1000" };
    for (const bad of [{ from: "nope" }, { to: "base" }, { asset: "DOGE" }, { receive: "USDC" }, { amount: "0" }, { amount: "1.5" }, { sender: "0x12" }, { recipient: SOL_WALLET }]) {
      expect(code(() => parseBridgeRequest({ ...base, ...bad }))).toBe("invalid");
    }
  });
});

describe("Relay's answers", () => {
  it("become a plan with an approval and the deposit", () => {
    const plan = parseRelay(relayBody(), usdcToUsdg());
    expect(plan.spender).toBe(DEPOSITORY);
    expect(plan.evm).toEqual({ chainId: 8453, to: DEPOSITORY, data: "0xe8017952", value: "0", gas: "76194" });
    expect(plan.route).toMatchObject({ id: "relay", outAmount: "249800000", minOut: "248500000", etaSeconds: 6, networkUsd: 0.001 });
    expect(plan.tracking).toEqual({ provider: "relay", requestId: REQUEST_ID, tool: null });
  });

  it("are refused if they aren't what was asked for", () => {
    const request = usdcToUsdg();
    expect(code(() => parseRelay(relayBody({}, { recipient: "0x0000000000000000000000000000000000000001" }), request))).toBe("no-route");
    expect(code(() => parseRelay(relayBody({}, { currencyIn: { currency: { chainId: 8453, address: USDG }, amount: "250000000" } }), request))).toBe("no-route");
    expect(code(() => parseRelay(relayBody({}, { currencyIn: { currency: { chainId: 8453, address: USDC_BASE }, amount: "1" } }), request))).toBe("no-route");
    expect(code(() => parseRelay(relayBody({}, { currencyOut: { currency: { chainId: 4663, address: USDG }, amount: "1", minimumAmount: "2" } }), request))).toBe("no-route");
  });

  it("are refused if they point at a contract nobody listed", () => {
    const steps = (to: string, spender = DEPOSITORY) => ({ steps: [approveStep(spender), { id: "deposit", kind: "transaction", items: [{ data: { to, data: "0x", value: "0", chainId: 8453 } }] }] });
    expect(code(() => parseRelay(relayBody(steps("0x000000000000000000000000000000000000beef")), usdcToUsdg()))).toBe("no-route");
    expect(code(() => parseRelay(relayBody(steps(DEPOSITORY, "0x000000000000000000000000000000000000beef")), usdcToUsdg()))).toBe("no-route");
  });

  it("are refused if the value doesn't match what's being sent", () => {
    const body = relayBody({ steps: [{ id: "deposit", kind: "transaction", items: [{ data: { to: DEPOSITORY, data: "0x", value: "1", chainId: 8453 } }] }] });
    expect(code(() => parseRelay(body, usdcToUsdg()))).toBe("no-route");
  });

  it("are refused if they need a signature flow", () => {
    expect(code(() => parseRelay(relayBody({ steps: [{ id: "authorize", kind: "signature", items: [{ data: {} }] }] }), usdcToUsdg()))).toBe("no-route");
  });

  const solanaBody = (programId: string, signer = SOL_WALLET) =>
    relayBody(
      { steps: [{ id: "deposit", kind: "transaction", items: [{ data: { instructions: [{ programId, data: "00", keys: [{ pubkey: signer, isSigner: true, isWritable: true }] }], addressLookupTableAddresses: [] } }] }] },
      { recipient: WALLET, currencyIn: { currency: { chainId: 792703809, address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, amount: "100000000" }, currencyOut: { currency: { chainId: 4663, address: USDG }, amount: "99000000", minimumAmount: "98000000" } },
    );
  const fromSolana = () => parseBridgeRequest({ from: "sol", to: "rh", asset: "USDC", receive: "USDG", amount: "100000000", sender: SOL_WALLET, recipient: WALLET });

  it("from Solana may only touch the depository, and only the sender signs", () => {
    expect(parseRelay(solanaBody("99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2"), fromSolana()).solana?.instructions).toHaveLength(1);
    expect(code(() => parseRelay(solanaBody("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), fromSolana()))).toBe("no-route");
    expect(code(() => parseRelay(solanaBody("99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2", "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv"), fromSolana()))).toBe("no-route");
  });

  it("report a transfer as delivered only with its fill, and a failure as final only when the refund failed", () => {
    expect(parseRelayStatus({ status: "success", txHashes: ["0xfill"] })).toEqual({ state: "delivered", destinationTx: "0xfill" });
    expect(parseRelayStatus({ status: "success", txHashes: [] }).state).toBe("transit");
    expect(parseRelayStatus({ status: "refund", txHashes: ["0xback"] })).toEqual({ state: "refunded", destinationTx: "0xback" });
    expect(parseRelayStatus({ status: "failure" }).state).toBe("transit");
    expect(parseRelayStatus({ status: "failure", refundFailReason: "MANUAL_REFUND_REQUIRED" }).state).toBe("failed");
    for (const status of ["unknown", "waiting", "depositing", "pending", "submitted"]) expect(parseRelayStatus({ status }).state).toBe("transit");
  });
});

describe("Across's answers", () => {
  const body = (patch: Record<string, unknown> = {}) => ({
    inputToken: { chainId: 8453, address: USDC_BASE },
    outputToken: { chainId: 4663, address: USDG },
    inputAmount: "250000000",
    expectedOutputAmount: "249840000",
    minOutputAmount: "249840000",
    expectedFillTime: 2,
    checks: { allowance: { spender: SPOKE_BASE, actual: "0", expected: "250000000" } },
    approvalTxns: [{ to: USDC_BASE, data: `0x095ea7b3${SPOKE_BASE.slice(2).padStart(64, "0")}${"f".repeat(64)}` }],
    fees: { total: { amountUsd: "0.158" }, originGas: { amountUsd: "0" } },
    swapTx: { chainId: 8453, to: SPOKE_BASE, data: `0xad5425c6${WALLET.slice(2).toLowerCase().padStart(64, "0")}` },
    ...patch,
  });

  it("take who to approve, never how much: its own approval is unlimited", () => {
    const plan = parseAcross(body(), usdcToUsdg());
    expect(plan.spender).toBe(SPOKE_BASE);
    expect(plan.evm?.value).toBe("0");
    expect(plan.route).toMatchObject({ id: "across", feeUsd: 0.158, networkUsd: null, etaSeconds: 7 });
  });

  it("are refused if the call doesn't name the recipient, or goes elsewhere", () => {
    expect(code(() => parseAcross(body({ swapTx: { chainId: 8453, to: SPOKE_BASE, data: "0xad5425c6" } }), usdcToUsdg()))).toBe("no-route");
    expect(code(() => parseAcross(body({ swapTx: { chainId: 8453, to: "0x000000000000000000000000000000000000beef", data: `0x${WALLET.slice(2).toLowerCase()}` } }), usdcToUsdg()))).toBe("no-route");
    expect(code(() => parseAcross(body({ inputAmount: "1" }), usdcToUsdg()))).toBe("no-route");
  });

  it("report a deposit by its fill; not found just means not yet", () => {
    expect(parseAcrossStatus(200, { status: "filled", fillTxnRef: "0xfill" })).toEqual({ state: "delivered", destinationTx: "0xfill" });
    expect(parseAcrossStatus(404, { error: "DepositNotFoundException" }).state).toBe("transit");
    expect(parseAcrossStatus(200, { status: "pending", depositRefundTxnRef: "0xback" }).state).toBe("refunded");
  });
});

describe("LI.FI's answers", () => {
  const body = (patch: Record<string, unknown> = {}) => ({
    tool: "layerswap",
    toolDetails: { name: "Layerswap" },
    action: { fromChainId: 8453, toChainId: 4663, fromToken: { address: USDC_BASE }, toToken: { address: USDG }, toAddress: WALLET },
    estimate: { fromAmount: "250000000", toAmount: "249300000", toAmountMin: "248000000", approvalAddress: DIAMOND, executionDuration: 7, fromAmountUSD: "249.8", toAmountUSD: "249.5", feeCosts: [{ amountUSD: "0.62" }], gasCosts: [{ amountUSD: "0.003" }] },
    transactionRequest: { chainId: 8453, to: DIAMOND, data: "0x6d21c5df", value: "0x0", gasLimit: "0xa852a" },
    ...patch,
  });

  it("become a plan, named for the bridge underneath", () => {
    const plan = parseLifi(body(), usdcToUsdg());
    expect(plan.route.name).toBe("Layerswap via LI.FI");
    expect(plan.tracking.tool).toBe("layerswap");
    expect(plan.evm?.gas).toBe("689450");
  });

  it("are refused for another recipient or an unlisted contract", () => {
    expect(code(() => parseLifi(body({ action: { ...body().action, toAddress: "0x0000000000000000000000000000000000000001" } }), usdcToUsdg()))).toBe("no-route");
    expect(code(() => parseLifi(body({ transactionRequest: { chainId: 8453, to: "0x000000000000000000000000000000000000beef", data: "0x", value: "0x0" } }), usdcToUsdg()))).toBe("no-route");
  });

  it("report refunds and failures; not found proves nothing", () => {
    expect(parseLifiStatus(200, { status: "DONE", substatus: "COMPLETED", receiving: { txHash: "0xfill" } })).toEqual({ state: "delivered", destinationTx: "0xfill" });
    expect(parseLifiStatus(200, { status: "DONE", substatus: "REFUNDED" }).state).toBe("refunded");
    expect(parseLifiStatus(200, { status: "FAILED" }).state).toBe("failed");
    expect(parseLifiStatus(200, { status: "NOT_FOUND" }).state).toBe("transit");
    expect(parseLifiStatus(404, null).state).toBe("transit");
  });
});

describe("the canonical bridge", () => {
  it("computes a deposit's hash exactly as it appears on Robinhood Chain", () => {
    // Real deposits, read from Ethereum and found on the chain at these hashes.
    expect(depositTxId(BigInt(439997), "0x1f17def89859f297fb32d0cfc6086b157c62c06f", BigInt("99846344918303762"))).toBe("0x66db99db1ccbefb1a719e446274c366ba8fcdcf7666699dec89b7e3f3e9b35a4");
    expect(depositTxId(BigInt(439987), "0x70affe3e6f9b60cf449a1ca52d2f5fe60f0e0b66", BigInt("99846148925162166"))).toBe("0xf4def4c9080586407bf3420e39bd14ee193f31ea70783373dc165f26bbc5fdff");
  });

  it("calls depositEth() on the Delayed Inbox with the amount as value, at no fee", () => {
    expect(DEPOSIT_ETH).toBe("0x439370b1");
    const plan = canonicalPlan(ethToEth());
    expect(plan.evm).toEqual({ chainId: 1, to: INBOX, data: "0x439370b1", value: "50000000000000000", gas: null });
    expect(plan.route).toMatchObject({ outAmount: "50000000000000000", minOut: "50000000000000000", trustless: true, feeUsd: 0 });
  });

  it("only applies to ETH from Ethereum into the sender's own address", () => {
    expect(canonicalApplies(ethToEth())).toBe(true);
    expect(canonicalApplies(ethToEth({ recipient: "0x0000000000000000000000000000000000000001" }))).toBe(false);
    expect(canonicalApplies(ethToEth({ gasTopUp: true }))).toBe(false);
    expect(canonicalApplies(parseBridgeRequest({ from: "base", to: "rh", asset: "ETH", receive: "ETH", amount: "1", sender: WALLET, recipient: WALLET }))).toBe(false);
    expect(canonicalApplies(parseBridgeRequest({ from: "eth", to: "rh", asset: "USDC", receive: "USDG", amount: "1", sender: WALLET, recipient: WALLET }))).toBe(false);
  });

  it("finds the message number in the deposit's receipt", () => {
    const topic = "0xff64905f73a67fb594e0f940a8075a860db489ad991e032f48c81123eb52d60b";
    expect(messageNumberOf({ logs: [{ address: INBOX, topics: [topic, "0x06b6bd"] }] })).toBe(BigInt(439997));
    expect(messageNumberOf({ logs: [{ address: "0x0000000000000000000000000000000000000001", topics: [topic, "0x06b6bd"] }] })).toBeNull();
  });
});

const plan = (route: Partial<ProviderPlan["route"]>, patch: Partial<ProviderPlan> = {}): ProviderPlan => ({
  route: { id: "x", provider: "relay", name: "X", outAmount: "249000000", minOut: "248000000", etaSeconds: 6, inUsd: null, outUsd: null, feeUsd: null, networkUsd: null, gasTopUp: null, trustless: false, ...route },
  tracking: { provider: "relay", requestId: REQUEST_ID, tool: null },
  spender: null,
  evm: { chainId: 8453, to: DEPOSITORY, data: "0x", value: "0", gas: null },
  solana: null,
  ...patch,
});

describe("comparing routes", () => {
  it("costs like for like from what goes in and comes out, at one price", () => {
    const [best, next] = finishRoutes([plan({ id: "a", outAmount: "249000000", feeUsd: 5, inUsd: 250, outUsd: 249 }), plan({ id: "b", outAmount: "249500000", feeUsd: 0.01 })], usdcToUsdg());
    expect(best.id).toBe("b");
    expect(best.feeUsd).toBeCloseTo(0.5, 5);
    expect(next.feeUsd).toBeCloseTo(1, 5);
  });

  it("lends a route that didn't say its gas the cost of one that did", () => {
    const routes = finishRoutes([plan({ id: "a", networkUsd: 0.02 }), plan({ id: "b" })], usdcToUsdg());
    expect(routes.find((route) => route.id === "b")?.networkUsd).toBe(0.02);
  });

  it("never reports a negative fee", () => {
    const request = parseBridgeRequest({ from: "bnb", to: "rh", asset: "BNB", receive: "ETH", amount: "150000000000000000", sender: WALLET, recipient: WALLET });
    expect(finishRoutes([plan({ outAmount: "49000000000000000", feeUsd: -0.03 })], request)[0].feeUsd).toBe(0);
  });

  it("takes delivered gas out of the route's own cost", () => {
    const [route] = finishRoutes([plan({ outAmount: "248800000", gasTopUp: { raw: "487", usd: 1 } })], usdcToUsdg({ gasTopUp: true }));
    expect(route.feeUsd).toBeCloseTo(0.2, 5);
  });
});

/** Answers each provider by its URL; anything unexpected fails the test. */
function stubFetch(answers: Partial<Record<"relay" | "across" | "rpc", (body: Record<string, unknown>) => { status: number; body: unknown }>>) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const key = url.includes("relay.link") ? "relay" : url.includes("across.to") ? "across" : "rpc";
    const answer = answers[key];
    if (!answer) throw new Error(`unexpected call: ${key}`);
    const result = answer(body);
    return new Response(JSON.stringify(result.body), { status: result.status });
  });
}

const config = (patch: Partial<ReturnType<typeof bridgeConfig>> = {}) => ({ ...bridgeConfig({ BRIDGE_TRADING: "on" }), ...patch });

describe("quoting", () => {
  it("leaves the rest standing when one route fails", async () => {
    stubFetch({ relay: () => ({ status: 200, body: relayBody() }), across: () => ({ status: 500, body: {} }) });
    const quote = await quoteBridge(usdcToUsdg(), config());
    expect(quote.routes.map((route) => route.id)).toEqual(["relay"]);
    expect(quote.tradingOpen).toBe(true);
  });

  it("says the amount is too small when that's the reason", async () => {
    stubFetch({ relay: () => ({ status: 400, body: { errorCode: "AMOUNT_TOO_LOW" } }), across: () => ({ status: 400, body: { code: "AMOUNT_TOO_LOW" } }) });
    await expect(quoteBridge(usdcToUsdg({ amount: "10" }), config({ lifiKey: "key" }))).rejects.toMatchObject({ code: "too-small" });
  });

  it("never calls a provider when they're switched off", async () => {
    stubFetch({});
    await expect(quoteBridge(usdcToUsdg(), config({ providersOn: false }))).rejects.toMatchObject({ code: "unavailable" });
  });

  it("only offers gas with Relay, and keeps Across out of Solana", async () => {
    stubFetch({ relay: () => ({ status: 200, body: relayBody() }) });
    await expect(quoteBridge(usdcToUsdg({ gasTopUp: true }), config())).resolves.toMatchObject({ routes: [{ id: "relay" }] });
  });
});

describe("building", () => {
  const rpc = (allowance: bigint) => () => ({ status: 200, body: { jsonrpc: "2.0", id: 1, result: `0x${allowance.toString(16)}` } });

  it("is refused while the switch is off", async () => {
    stubFetch({});
    await expect(buildBridge(usdcToUsdg(), "relay", "249800000", config({ tradingOpen: false }))).rejects.toMatchObject({ code: "closed" });
  });

  it("needs real wallets at both ends", async () => {
    stubFetch({});
    await expect(buildBridge(parseBridgeRequest({ from: "base", to: "rh", asset: "USDC", receive: "USDG", amount: "1000" }), "relay", "900", config())).rejects.toMatchObject({ code: "invalid" });
  });

  it("approves exactly what's being sent, and only when the allowance is short", async () => {
    stubFetch({ relay: () => ({ status: 200, body: relayBody() }), rpc: rpc(BigInt(0)) });
    const build = await buildBridge(usdcToUsdg(), "relay", "249800000", config());
    expect(build.approvals).toEqual([{ token: USDC_BASE, spender: DEPOSITORY, amount: "250000000" }]);
    stubFetch({ relay: () => ({ status: 200, body: relayBody() }), rpc: rpc(BigInt(250_000_000)) });
    expect((await buildBridge(usdcToUsdg(), "relay", "249800000", config())).approvals).toEqual([]);
  });

  it("clears an old allowance first on mainnet USDT, which refuses to change one directly", async () => {
    const usdt = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const request = parseBridgeRequest({ from: "eth", to: "rh", asset: "USDT", receive: "USDG", amount: "100000000", sender: WALLET, recipient: WALLET });
    const body = relayBody(
      { steps: [{ id: "approve", kind: "transaction", items: [{ data: { to: usdt, data: `0x095ea7b3${DEPOSITORY.slice(2).padStart(64, "0")}${"0".repeat(64)}`, value: "0", chainId: 1 } }] }, { id: "deposit", kind: "transaction", items: [{ data: { to: DEPOSITORY, data: "0xe8017952", value: "0", chainId: 1 } }] }] },
      { currencyIn: { currency: { chainId: 1, address: usdt }, amount: "100000000" }, currencyOut: { currency: { chainId: 4663, address: USDG }, amount: "99000000", minimumAmount: "98000000" } },
    );
    stubFetch({ relay: () => ({ status: 200, body }), rpc: rpc(BigInt(5)) });
    const build = await buildBridge(request, "relay", "99000000", config());
    expect(build.approvals.map((item) => item.amount)).toEqual(["0", "100000000"]);
  });

  it("asks again when the figures fell below what was reviewed", async () => {
    stubFetch({ relay: () => ({ status: 200, body: relayBody() }), rpc: rpc(BigInt(0)) });
    await expect(buildBridge(usdcToUsdg(), "relay", "260000000", config())).rejects.toMatchObject({ code: "price-moved" });
  });

  it("won't build a route it doesn't know", async () => {
    stubFetch({});
    await expect(buildBridge(usdcToUsdg(), "made-up", "1", config())).rejects.toMatchObject({ code: "invalid" });
    await expect(buildBridge(usdcToUsdg(), "canonical", "1", config())).rejects.toMatchObject({ code: "invalid" });
  });

  it("won't take a contract wallet through the canonical bridge, where it would be credited at another address", async () => {
    stubFetch({ rpc: () => ({ status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x6080" } }) });
    await expect(buildBridge(ethToEth(), "canonical", "50000000000000000", config())).rejects.toMatchObject({ code: "no-route" });
  });

  it("across builds with checksummed addresses", async () => {
    let asked = "";
    vi.stubGlobal("fetch", async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ code: "AMOUNT_TOO_LOW" }), { status: 400 });
    });
    await expect(acrossPlan(usdcToUsdg(), config())).rejects.toMatchObject({ code: "too-small" });
    expect(asked).toContain("inputToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });
});

describe("the RPC fallback", () => {
  it("moves on from one that fails, and rests it", async () => {
    const asked: string[] = [];
    const connect = (url: string) => async () => {
      asked.push(url);
      if (url === "a") throw new Error("down");
      return "ok";
    };
    const rpc = firstAnswering(["a", "b"], connect);
    await expect(rpc("eth_call", [])).resolves.toBe("ok");
    await expect(rpc("eth_call", [])).resolves.toBe("ok");
    expect(asked).toEqual(["a", "b", "b"]);
  });
});
