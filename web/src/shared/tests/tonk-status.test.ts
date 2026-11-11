// @vitest-environment node
// The launchpad's server code runs on viem, which needs Node's own Uint8Array.
import { encodeAbiParameters, encodeEventTopics, type PublicClient, TransactionNotFoundError, TransactionReceiptNotFoundError } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import { LAUNCHPAD_ABI } from "@/shared/tonk/server/abi";
import { explorerNonceLookup, type NonceLookup, txStatus } from "@/shared/tonk/server/status";

const SENDER = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f" as const;
const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"85".repeat(32)}` as const;
const OTHER = `0x${"99".repeat(32)}` as const;
const NONCE = 7;

/** A lock extension's receipt: the launchpad's LockExtended event (Astra's +7-day extension). */
function receipt(hash: `0x${string}`, status: "success" | "reverted" = "success", logs = [extendedLog(hash)]) {
  return { transactionHash: hash, status, blockNumber: BigInt(151_760_000), logs: status === "success" ? logs : [] };
}
function extendedLog(hash: `0x${string}`) {
  const topics = encodeEventTopics({ abi: LAUNCHPAD_ABI, eventName: "LockExtended", args: { token: TOKEN, creator: SENDER } });
  return { address: TONK_TESTNET.launchpad, topics, data: encodeAbiParameters([{ type: "uint64" }], [BigInt(1_810_000_000)]), blockNumber: BigInt(151_760_000), transactionHash: hash, logIndex: 0, blockHash: `0x${"b".repeat(64)}`, transactionIndex: 0, removed: false };
}

interface Chain {
  /** Receipts by hash, read in turn: a list lets a receipt appear on a later read. */
  receipts: Record<string, Array<ReturnType<typeof receipt> | null | Error>>;
  tx: { blockNumber: bigint | null } | null | Error;
  used: number;
  /** What other transactions called, by hash; an Error when that read fails. */
  calls?: Record<string, { to: `0x${string}` | null; input: `0x${string}`; value: bigint } | Error>;
}

/** A client that answers from `chain`, with viem's own not-found errors. */
function client(chain: Chain): PublicClient {
  const reads: Record<string, number> = {};
  return {
    getTransactionReceipt: vi.fn(async ({ hash }: { hash: `0x${string}` }) => {
      const list = chain.receipts[hash] ?? [null];
      const index = Math.min(reads[hash] ?? 0, list.length - 1);
      reads[hash] = index + 1;
      const answer = list[index];
      if (answer instanceof Error) throw answer;
      if (!answer) throw new TransactionReceiptNotFoundError({ hash });
      return answer;
    }),
    getTransaction: vi.fn(async ({ hash }: { hash: `0x${string}` }) => {
      const call = chain.calls?.[hash];
      if (call instanceof Error) throw call;
      if (call) return { hash, from: SENDER, nonce: NONCE, blockNumber: BigInt(151_760_001), ...call };
      if (chain.tx instanceof Error) throw chain.tx;
      if (!chain.tx) throw new TransactionNotFoundError({ hash });
      return { hash, from: SENDER, nonce: NONCE, ...chain.tx };
    }),
    getTransactionCount: vi.fn(async () => chain.used),
  } as unknown as PublicClient;
}
const lookup = (found: `0x${string}` | null): NonceLookup => vi.fn(async () => found);
const status = (chain: Partial<Chain>, found: `0x${string}` | null = null, hint = null as { from: `0x${string}`; nonce: number } | null) =>
  txStatus(client({ receipts: {}, tx: null, used: 0, ...chain }), TONK_TESTNET, HASH, hint, lookup(found));

describe("a transaction's status", () => {
  it("is settled by its own receipt: confirmed with what it did, or failed", async () => {
    await expect(status({ receipts: { [HASH]: [receipt(HASH)] } })).resolves.toMatchObject({ state: "confirmed", events: [{ kind: "extended", token: TOKEN }], block: 151_760_000, replacedBy: null });
    await expect(status({ receipts: { [HASH]: [receipt(HASH, "reverted")] } })).resolves.toMatchObject({ state: "failed", events: [] });
  });

  it("never calls a mined transaction replaced when its receipt is late: it stays pending", async () => {
    // Astra's case: the receipt read failed while the transaction was already mined, and the nonce spent by it.
    await expect(status({ tx: { blockNumber: BigInt(151_760_000) }, used: NONCE + 1 })).resolves.toMatchObject({ state: "pending", sender: { from: SENDER, nonce: NONCE } });
  });

  it("treats a failed read as an error, never as an answer", async () => {
    await expect(status({ receipts: { [HASH]: [new Error("socket hang up")] } })).rejects.toMatchObject({ code: "unavailable" });
    await expect(status({ tx: new Error("502") })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("finds its own receipt when the spent nonce was its own, read a moment late", async () => {
    await expect(status({ receipts: { [HASH]: [null, receipt(HASH)] }, tx: { blockNumber: null }, used: NONCE + 1 })).resolves.toMatchObject({ state: "confirmed", replacedBy: null });
  });

  it("stays unknown, never replaced, when the nonce is spent and no other transaction is found", async () => {
    const answer = await status({ tx: { blockNumber: null }, used: NONCE + 1 }, null);
    expect(answer).toMatchObject({ state: "unknown", sender: { from: SENDER, nonce: NONCE }, replacedBy: null });
  });

  it("reports the wallet's replacement, found at the same nonce, with that transaction's own receipt", async () => {
    // A speed-up does the same thing; a cancellation does nothing. The page tells them apart by the events.
    const sped = await status({ receipts: { [OTHER]: [receipt(OTHER)] }, tx: { blockNumber: null }, used: NONCE + 1 }, OTHER);
    expect(sped).toMatchObject({ state: "confirmed", replacedBy: OTHER, events: [{ kind: "extended" }] });
    const cancelled = await status({ receipts: { [OTHER]: [receipt(OTHER, "success", [])] }, tx: { blockNumber: null }, used: NONCE + 1 }, OTHER);
    expect(cancelled).toMatchObject({ state: "confirmed", replacedBy: OTHER, events: [] });
    await expect(status({ tx: { blockNumber: null }, used: NONCE + 1 }, OTHER)).resolves.toMatchObject({ state: "pending", replacedBy: OTHER });
  });

  it("says what the replacement called, for the page to tell a sped-up copy from anything else", async () => {
    const extend = { to: TONK_TESTNET.launchpad, input: "0x1234abcd" as const, value: BigInt(0) };
    const answer = await status({ receipts: { [OTHER]: [receipt(OTHER)] }, tx: { blockNumber: null }, used: NONCE + 1, calls: { [OTHER]: extend } }, OTHER);
    expect(answer).toMatchObject({ state: "confirmed", replacedBy: OTHER, replacedCall: { to: TONK_TESTNET.launchpad, data: "0x1234abcd", value: "0" } });
    // Unreadable, it is left out: the page then judges by the events alone.
    const unread = await status({ receipts: { [OTHER]: [receipt(OTHER)] }, tx: { blockNumber: null }, used: NONCE + 1, calls: { [OTHER]: new Error("502") } }, OTHER);
    expect(unread).toMatchObject({ state: "confirmed", replacedBy: OTHER, replacedCall: null });
  });

  it("traces a transaction the node dropped through the sender and nonce from an earlier answer", async () => {
    await expect(status({ used: NONCE + 1 }, null, null)).resolves.toMatchObject({ state: "unknown", sender: null });
    const traced = await status({ receipts: { [OTHER]: [receipt(OTHER, "success", [])] }, used: NONCE + 1 }, OTHER, { from: SENDER, nonce: NONCE });
    expect(traced).toMatchObject({ state: "confirmed", replacedBy: OTHER });
    await expect(status({ used: NONCE }, null, { from: SENDER, nonce: NONCE })).resolves.toMatchObject({ state: "unknown", sender: { nonce: NONCE } });
  });
});

describe("the explorer's answer for a spent nonce", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the hash of the sender's transaction at that nonce, or nothing when it can't tell", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [{ nonce: 8, hash: `0x${"88".repeat(32)}` }, { nonce: NONCE, hash: OTHER }] })));
    vi.stubGlobal("fetch", fetcher);
    await expect(explorerNonceLookup(TONK_TESTNET)(SENDER, NONCE)).resolves.toBe(OTHER);
    expect(fetcher).toHaveBeenCalledWith(`${TONK_TESTNET.explorerUrl}/api/v2/addresses/${SENDER}/transactions?filter=from`, expect.anything());
    await expect(explorerNonceLookup(TONK_TESTNET)(SENDER, 3)).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(explorerNonceLookup(TONK_TESTNET)(SENDER, NONCE)).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ nonce: NONCE, hash: "0xnope" }] }))));
    await expect(explorerNonceLookup(TONK_TESTNET)(SENDER, NONCE)).resolves.toBeNull();
  });
});
