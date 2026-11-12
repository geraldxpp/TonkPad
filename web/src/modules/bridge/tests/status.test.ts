// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { networkOf } from "../lib/networks";
import { clearRpcRest } from "../server/rpc";
import { assembleRelayTransaction } from "../server/solana";
import { sourceState } from "../server/status";

const SOL = networkOf("sol");
if (!SOL) throw new Error("no Solana network");
const SIG = "XwezcpfxY3Eszn4sxgkibUGawpox91CqD3YuXK84x95c359GuYuG8W7x3Byqm2pPLXe5C8hyfpRUYFCVTmftZYn";

/** A Solana RPC at `height` that has `status` for the signature (null: no record), or fails that lookup. */
function solana(height: number, status: Record<string, unknown> | null, lookup: "answers" | "fails" = "answers") {
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const { id, method } = JSON.parse(String(init?.body)) as { id: number; method: string };
    if (method === "getSignatureStatuses" && lookup === "fails") return new Response("busy", { status: 503 });
    const result = method === "getBlockHeight" ? height : { context: { slot: 1 }, value: [status] };
    return Response.json({ jsonrpc: "2.0", id, result });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearRpcRest();
});

describe("a Solana deposit's first transaction", () => {
  it("was dropped once the chain is past its blockhash's last valid height with no record of it (the owner's stuck transfer, 12 Nov)", async () => {
    solana(1_001, null);
    expect(await sourceState(SOL, SIG, 1_000)).toMatchObject({ state: "dropped" });
  });

  it("is still pending while its blockhash can still land it, and when the record has no height (older transfers)", async () => {
    solana(1_000, null);
    expect(await sourceState(SOL, SIG, 1_000)).toMatchObject({ state: "pending" });
    solana(5_000, null);
    expect(await sourceState(SOL, SIG, null)).toMatchObject({ state: "pending" });
  });

  it("counts a record of it, whatever the height, and never takes a failed lookup for a drop", async () => {
    solana(9_999, { confirmationStatus: "confirmed", err: null, slot: 5 });
    expect(await sourceState(SOL, SIG, 1_000)).toMatchObject({ state: "confirmed" });
    solana(9_999, null, "fails");
    expect(await sourceState(SOL, SIG, 1_000)).toMatchObject({ state: "pending" });
  });
});

describe("a Solana deposit's build", () => {
  it("keeps the last block height its blockhash allows, so the status can tell a dropped send", async () => {
    const payer = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
    const rpc = async (method: string) => (method === "getLatestBlockhash" ? { context: { slot: 1 }, value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1_234 } } : null);
    const plan = { instructions: [{ programId: "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2", keys: [{ pubkey: payer, isSigner: true, isWritable: true }], data: "00" }], addressLookupTableAddresses: [] };
    const built = await assembleRelayTransaction(plan, payer, rpc);
    expect(built.validUntil).toBe(1_234);
    expect(built.transaction).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
