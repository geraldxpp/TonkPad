import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/wallet/[chain]/[owner]/route";
import { readWalletBalances } from "@/shared/wallet/server";

vi.mock("@/shared/wallet/server", () => ({ readWalletBalances: vi.fn() }));

const SOL_OWNER = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const MINT = "2GSJNkKkSLbEguGBbEfURnu8wccqRDwRBnNCP8owxzZW";
const EVM_OWNER = "0x7a5e00000000000000000000000000000000c0de";
const read = vi.mocked(readWalletBalances);

function call(chain: string, owner: string, token?: string) {
  const query = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
  const request = new Request(`http://localhost/api/wallet/${chain}/${encodeURIComponent(owner)}${query}`);
  return GET(request, { params: Promise.resolve({ chain, owner }) });
}

beforeEach(() => {
  read.mockReset();
});

describe("GET /api/wallet/[chain]/[owner]", () => {
  it.each([
    ["an unknown chain", "eth", EVM_OWNER, undefined],
    ["a Solana key on Robinhood Chain", "rh", SOL_OWNER, undefined],
    ["an EVM address on Solana", "sol", EVM_OWNER, undefined],
    ["a malformed owner", "sol", "not-an-address", undefined],
    ["a token in the wrong format", "sol", SOL_OWNER, EVM_OWNER],
    ["an empty token", "rh", EVM_OWNER, ""],
  ])("refuses %s without calling any RPC", async (_case, chain, owner, token) => {
    const response = await call(chain, owner, token);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(read).not.toHaveBeenCalled();
  });

  it("returns the balances of a valid wallet and token", async () => {
    const balances = { chain: "sol" as const, owner: SOL_OWNER, native: { raw: "1", decimals: 9 }, token: { address: MINT, amount: { raw: "2", decimals: 6 } }, readAt: 1 };
    read.mockResolvedValue(balances);
    const response = await call("sol", SOL_OWNER, MINT);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(balances);
    expect(read).toHaveBeenCalledWith("sol", SOL_OWNER, MINT);
  });

  it("answers 502 without the provider's error when the read fails", async () => {
    read.mockRejectedValue(new Error("RPC getBalance: HTTP 401 https://mainnet.helius-rpc.com/?api-key=secret"));
    const response = await call("rh", EVM_OWNER);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(JSON.parse(text)).toEqual({ error: "balances unavailable" });
  });
});
