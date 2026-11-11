import { describe, expect, it, vi } from "vitest";
import { balancesPath, isWalletBalances } from "@/shared/wallet/balances";
import { jsonRpc, readEvmBalances, readSolanaBalances, type RpcCall } from "@/shared/wallet/rpc";
import { mainnetNetwork, TONK_TESTNET } from "@/shared/tonk/networks";
import { tonkRpcUrl } from "@/shared/tonk/server/client";
import { PUBLIC_RPC, walletRpcUrl } from "@/shared/wallet/server";

const SOL_OWNER = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const MINT = "2GSJNkKkSLbEguGBbEfURnu8wccqRDwRBnNCP8owxzZW";
const EVM_OWNER = "0x7a5e00000000000000000000000000000000c0de";
const ERC20 = "0x1234567890abcdef1234567890abcdef12345678";

/** A fake RPC that answers from a table and records every call. */
function fakeRpc(answers: Record<string, (params: readonly unknown[]) => unknown>) {
  const calls: Array<[string, readonly unknown[]]> = [];
  const rpc: RpcCall = async (method, params) => {
    calls.push([method, params]);
    const answer = answers[method];
    if (!answer) throw new Error(`unexpected ${method}`);
    return answer(params);
  };
  return { rpc, calls };
}

const tokenAccount = (amount: string, decimals: number) => ({
  account: { data: { parsed: { info: { tokenAmount: { amount, decimals, uiAmountString: "ignored" } } } } },
});

describe("readSolanaBalances", () => {
  it("reads SOL and adds up every account of the mint", async () => {
    const { rpc, calls } = fakeRpc({
      getBalance: () => ({ context: { slot: 1 }, value: 1_500_000_000 }),
      getTokenAccountsByOwner: () => ({ value: [tokenAccount("2000000000000", 6), tokenAccount("500000000000", 6)] }),
    });
    await expect(readSolanaBalances(rpc, SOL_OWNER, MINT)).resolves.toEqual({
      native: { raw: "1500000000", decimals: 9 },
      token: { raw: "2500000000000", decimals: 6 },
    });
    expect(calls).toEqual([
      ["getBalance", [SOL_OWNER, { commitment: "confirmed" }]],
      ["getTokenAccountsByOwner", [SOL_OWNER, { mint: MINT }, { commitment: "confirmed", encoding: "jsonParsed" }]],
    ]);
  });

  it("reports a wallet without the token as holding none, and skips the token without a mint", async () => {
    const { rpc, calls } = fakeRpc({ getBalance: () => ({ value: 0 }), getTokenAccountsByOwner: () => ({ value: [] }) });
    await expect(readSolanaBalances(rpc, SOL_OWNER, MINT)).resolves.toEqual({ native: { raw: "0", decimals: 9 }, token: { raw: "0", decimals: 0 } });
    await expect(readSolanaBalances(rpc, SOL_OWNER, null)).resolves.toEqual({ native: { raw: "0", decimals: 9 }, token: null });
    expect(calls.filter(([method]) => method === "getTokenAccountsByOwner")).toHaveLength(1);
  });

  it("rejects malformed answers instead of showing a wrong balance", async () => {
    const bad = fakeRpc({ getBalance: () => ({ value: -1 }) });
    await expect(readSolanaBalances(bad.rpc, SOL_OWNER, null)).rejects.toThrow();
    const odd = fakeRpc({ getBalance: () => ({ value: 1 }), getTokenAccountsByOwner: () => ({ value: [tokenAccount("1.5", 6)] }) });
    await expect(readSolanaBalances(odd.rpc, SOL_OWNER, MINT)).rejects.toThrow();
  });
});

describe("readEvmBalances", () => {
  it("reads ETH, balanceOf and decimals", async () => {
    const { rpc, calls } = fakeRpc({
      eth_getBalance: () => "0x3782dace9d90000", // 0.25 ETH
      eth_call: ([call]) => ((call as { data: string }).data === "0x313ce567" ? `0x${"12".padStart(64, "0")}` : `0x${(BigInt(10) ** BigInt(24)).toString(16).padStart(64, "0")}`),
    });
    await expect(readEvmBalances(rpc, EVM_OWNER, ERC20)).resolves.toEqual({
      native: { raw: "250000000000000000", decimals: 18 },
      token: { raw: "1000000000000000000000000", decimals: 18 },
    });
    expect(calls).toContainEqual(["eth_call", [{ to: ERC20, data: `0x70a08231${"0".repeat(24)}7a5e00000000000000000000000000000000c0de` }, "latest"]]);
  });

  it("rejects a token that answers nothing (no contract there)", async () => {
    const { rpc } = fakeRpc({ eth_getBalance: () => "0x0", eth_call: () => "0x" });
    await expect(readEvmBalances(rpc, EVM_OWNER, ERC20)).rejects.toThrow();
  });
});

describe("jsonRpc", () => {
  const url = "https://mainnet.helius-rpc.com/?api-key=secret-key";
  const failure = (rpc: RpcCall) => rpc("getBalance", []).then(() => "", (reason: unknown) => String(reason));

  it("posts one JSON-RPC request and returns its result", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: 7 } })));
    await expect(jsonRpc(url, fetchMock)("getBalance", ["x"])).resolves.toEqual({ value: 7 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ jsonrpc: "2.0", id: 1, method: "getBalance", params: ["x"] });
  });

  it("never puts the provider URL (and its key) in an error", async () => {
    const http = await failure(jsonRpc(url, vi.fn<typeof fetch>(async () => new Response("no", { status: 401 }))));
    expect(http).toContain("HTTP 401");
    expect(http).not.toContain("secret-key");
    const body = JSON.stringify({ error: { message: `bad key ${url}` } });
    const rpcError = await failure(jsonRpc(url, vi.fn<typeof fetch>(async () => new Response(body))));
    expect(rpcError).toContain("getBalance");
    expect(rpcError).not.toContain("secret-key");
  });
});

describe("walletRpcUrl", () => {
  it("prefers the server's own providers and falls back to the public RPCs", () => {
    expect(walletRpcUrl("sol", {})).toBe(PUBLIC_RPC.sol);
    expect(walletRpcUrl("sol", { HELIUS_API_KEY: "k" })).toBe("https://mainnet.helius-rpc.com/?api-key=k");
    expect(walletRpcUrl("sol", { HELIUS_API_KEY: "k", SOLANA_RPC_URL: "http://127.0.0.1:1/sol" })).toBe("http://127.0.0.1:1/sol");
    expect(walletRpcUrl("rh", {})).toBe(PUBLIC_RPC.rh);
    expect(walletRpcUrl("rh", { ROBINHOOD_RPC_URL: " https://example.test/rpc " })).toBe("https://example.test/rpc");
    // Off the testnet site a launchpad RPC never replaces the site's own Robinhood Chain RPC for balances.
    expect(walletRpcUrl("rh", { ROBINHOOD_RPC_URL: "https://example.test/rpc", TONK_RPC_URL: "https://launchpad.test/rpc" })).toBe("https://example.test/rpc");
  });
});

describe("the launchpad's RPC", () => {
  const mainnet = mainnetNetwork({ launchpad: `0x${"1".repeat(40)}`, migrator: `0x${"2".repeat(40)}`, block: "1" });

  it("on mainnet prefers TONK_RPC_URL, then the site's Robinhood Chain RPC, then the public one", () => {
    if (!mainnet) throw new Error("the deployment should connect");
    expect(tonkRpcUrl(mainnet, {})).toBe("https://rpc.mainnet.chain.robinhood.com");
    expect(tonkRpcUrl(mainnet, { ROBINHOOD_RPC_URL: " https://site.test/rpc " })).toBe("https://site.test/rpc");
    expect(tonkRpcUrl(mainnet, { ROBINHOOD_RPC_URL: "https://site.test/rpc", TONK_RPC_URL: "https://launchpad.test/rpc" })).toBe("https://launchpad.test/rpc");
  });

  it("on testnet never takes the mainnet RPC, whatever is set", () => {
    expect(tonkRpcUrl(TONK_TESTNET, { ROBINHOOD_RPC_URL: "https://site.test/rpc" })).toBe(TONK_TESTNET.rpcUrl);
    expect(tonkRpcUrl(TONK_TESTNET, { TONK_RPC_URL: "https://launchpad.test/rpc" })).toBe("https://launchpad.test/rpc");
  });
});

describe("balances responses", () => {
  const body = {
    chain: "sol",
    owner: SOL_OWNER,
    native: { raw: "1", decimals: 9 },
    token: { address: MINT, amount: { raw: "2", decimals: 6 } },
    readAt: 1,
  };

  it("builds the route's path", () => {
    expect(balancesPath("sol", SOL_OWNER, MINT)).toBe(`/api/wallet/sol/${SOL_OWNER}?token=${MINT}`);
    expect(balancesPath("rh", EVM_OWNER, null)).toBe(`/api/wallet/rh/${EVM_OWNER}`);
  });

  it("accepts only the wallet, chain and token that were asked for", () => {
    expect(isWalletBalances(body, "sol", SOL_OWNER, MINT)).toBe(true);
    expect(isWalletBalances(body, "rh", SOL_OWNER, MINT)).toBe(false);
    expect(isWalletBalances(body, "sol", "So11111111111111111111111111111111111111112", MINT)).toBe(false);
    expect(isWalletBalances(body, "sol", SOL_OWNER, "So11111111111111111111111111111111111111112")).toBe(false);
    expect(isWalletBalances({ ...body, native: { raw: "-1", decimals: 9 } }, "sol", SOL_OWNER, MINT)).toBe(false);
    expect(isWalletBalances({ ...body, token: null }, "sol", SOL_OWNER, null)).toBe(true);
  });
});
