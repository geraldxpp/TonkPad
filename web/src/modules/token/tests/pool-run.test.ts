import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TonkApiError } from "@/shared/tonk/api";
import type { PoolQuoteJson, PoolTradeBuild, PoolTradeRequest } from "@/shared/tonk/pool";
import type { UnsignedTx } from "@/shared/tonk/types";
import type { SettledTx } from "@/shared/tonk/useTxStatus";
import { WalletActionError } from "@/shared/wallet/types";
import { usePoolRun } from "../hooks/usePoolRun";

const mocks = vi.hoisted(() => ({ buildPoolTrade: vi.fn(), settled: vi.fn(), send: vi.fn() }));
vi.mock("@/shared/tonk/api", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/api")>()), buildPoolTrade: mocks.buildPoolTrade }));
vi.mock("@/shared/tonk/useTxStatus", () => ({ settled: mocks.settled }));
vi.mock("@/shared/wallet/wallet", () => ({ wallet: { sendEvmTransaction: mocks.send } }));

const TOKEN = "0x1111111111111111111111111111111111111111";
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const ROUTER = "0x204faca1764b154221e35c0d20abb3c525710498";
const APPROVE = `0x${"a1".repeat(32)}`;
const ALLOW = `0x${"a2".repeat(32)}`;
const SWAP = `0x${"5a".repeat(32)}`;
const SELL: PoolTradeRequest = { token: TOKEN, trader: `0x${"3".repeat(40)}`, side: "sell", amount: "5000", minOut: "1" };
const QUOTE: PoolQuoteJson = { pool: `0x${"c".repeat(64)}`, side: "sell", amountIn: "5000", out: "40", feeBps: 400, block: 1 };
const tx = (to: string): UnsignedTx => ({ to, data: "0x", value: "0", gas: "100000" });
const step = (name: "approve" | "allow" | "trade", to: string): PoolTradeBuild => ({ step: name, tx: tx(to), quote: QUOTE });
const receipt = (patch: Partial<SettledTx> = {}): SettledTx => ({ state: "confirmed", events: [], block: 2, replacedBy: null, replacedCall: null, ...patch });
const SPED_UP = `0x${"b1".repeat(32)}`;

function run() {
  const onSent = vi.fn();
  const hook = renderHook(() => usePoolRun(onSent));
  const start = () => act(() => hook.result.current.start(SELL));
  return { onSent, result: hook.result, start };
}

beforeEach(() => {
  mocks.buildPoolTrade.mockReset();
  mocks.settled.mockReset().mockResolvedValue(receipt());
  mocks.send.mockReset();
});

describe("a sale on a graduated token's pool", () => {
  it("runs Permit2's exact approval, then the router's allowance, then the swap, each build naming the step just confirmed", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN)).mockResolvedValueOnce(step("allow", PERMIT2)).mockResolvedValueOnce(step("trade", ROUTER));
    mocks.send.mockResolvedValueOnce(APPROVE).mockResolvedValueOnce(ALLOW).mockResolvedValueOnce(SWAP);
    const { onSent, result, start } = run();
    await start();
    expect(mocks.send.mock.calls.map(([sent]) => sent.to)).toEqual([TOKEN, PERMIT2, ROUTER]);
    expect(mocks.buildPoolTrade.mock.calls.map(([request]) => request.approval ?? null)).toEqual([null, APPROVE, ALLOW]);
    expect(mocks.settled.mock.calls.map(([hash]) => hash)).toEqual([APPROVE, ALLOW]);
    expect(onSent).toHaveBeenCalledWith(SWAP);
    expect(result.current.state.step).toBe("idle");
  });

  it("stops, sending nothing more, when a build after a confirmed approval asks for that approval again", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN)).mockResolvedValueOnce(step("approve", TOKEN));
    mocks.send.mockResolvedValueOnce(APPROVE);
    const { onSent, result, start } = run();
    await start();
    expect(result.current.state).toMatchObject({ step: "failed", error: "approvedNotSent", approval: APPROVE });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
  });

  it("says the approval went through when the next build fails, and sends nothing more", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN)).mockRejectedValueOnce(new TonkApiError("unavailable"));
    mocks.send.mockResolvedValueOnce(APPROVE);
    const { result, start } = run();
    await start();
    expect(result.current.state).toMatchObject({ step: "failed", error: "approvedNotSent", approval: APPROVE });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("counts a sped-up copy of an approval, the very same call, and builds the next step on the copy's hash", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN)).mockResolvedValueOnce(step("trade", ROUTER));
    mocks.send.mockResolvedValueOnce(APPROVE).mockResolvedValueOnce(SWAP);
    mocks.settled.mockResolvedValueOnce(receipt({ replacedBy: SPED_UP, replacedCall: { to: TOKEN.toUpperCase().replace("0X", "0x"), data: "0x", value: "0" } }));
    const { onSent, start } = run();
    await start();
    expect(mocks.buildPoolTrade.mock.calls[1][0]).toMatchObject({ approval: SPED_UP });
    expect(onSent).toHaveBeenCalledWith(SWAP);
  });

  it("stops on an approval the wallet replaced with anything else, or that reverted, without building again", async () => {
    const other = `0x${"99".repeat(32)}`;
    for (const [settledAs, error] of [
      [receipt({ state: "replaced", replacedBy: other }), "replaced"],
      // A replacement whose call can't be read: neither approval leaves an event to check instead.
      [receipt({ replacedBy: other }), "replaced"],
      // A cancellation: the wallet sent nothing to itself in the approval's place.
      [receipt({ replacedBy: other, replacedCall: { to: SELL.trader, data: "0x", value: "0" } }), "replaced"],
      // The same token, but a different call.
      [receipt({ replacedBy: other, replacedCall: { to: TOKEN, data: "0x095ea7b3", value: "0" } }), "replaced"],
      [receipt({ state: "failed" }), "reverted"],
    ] as const) {
      mocks.buildPoolTrade.mockReset().mockResolvedValueOnce(step("approve", TOKEN));
      mocks.send.mockReset().mockResolvedValueOnce(APPROVE);
      mocks.settled.mockReset().mockResolvedValueOnce(settledAs);
      const { result, start } = run();
      await start();
      expect(result.current.state).toMatchObject({ step: "failed", error, approval: APPROVE });
      expect(mocks.buildPoolTrade).toHaveBeenCalledTimes(1);
      expect(mocks.send).toHaveBeenCalledTimes(1);
    }
  });

  it("names the wallet's own refusal of the swap after the approvals, not the approval", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN)).mockResolvedValueOnce(step("trade", ROUTER));
    mocks.send.mockResolvedValueOnce(APPROVE).mockRejectedValueOnce(new WalletActionError("rejected"));
    const { onSent, result, start } = run();
    await start();
    expect(result.current.state).toMatchObject({ step: "failed", error: "rejected" });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("keeps the review open with the fresh quote when the pool moved, and sends nothing", async () => {
    const fresh = { ...QUOTE, out: "30" };
    mocks.buildPoolTrade.mockResolvedValueOnce({ step: "moved", quote: fresh } satisfies PoolTradeBuild);
    const { result, start } = run();
    await start();
    expect(result.current.state).toMatchObject({ step: "idle", moved: fresh });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("stops watching a slow approval when asked, never calling it failed and never building the sale", async () => {
    mocks.buildPoolTrade.mockResolvedValueOnce(step("approve", TOKEN));
    mocks.send.mockResolvedValueOnce(APPROVE);
    mocks.settled.mockImplementationOnce(
      (_hash: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("stopped watching", "AbortError")))),
    );
    const { result } = run();
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.start(SELL);
    });
    await vi.waitFor(() => expect(result.current.state.step).toBe("approving"));
    act(() => result.current.reset());
    await act(() => running);
    expect(result.current.state).toMatchObject({ step: "idle", error: null });
    expect(mocks.buildPoolTrade).toHaveBeenCalledTimes(1);
  });
});
