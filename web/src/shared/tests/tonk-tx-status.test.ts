import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LaunchStatus } from "@/shared/tonk/types";
import { settled, STALL_MS, useTxStatus } from "@/shared/tonk/useTxStatus";

const mocks = vi.hoisted(() => ({ fetchLaunchStatus: vi.fn() }));
vi.mock("@/shared/tonk/api", () => ({ fetchLaunchStatus: mocks.fetchLaunchStatus }));

const HASH = `0x${"85".repeat(32)}`;
const SENDER = { from: "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f", nonce: 7 } as const;
const answer = (patch: Partial<LaunchStatus>): LaunchStatus => ({ state: "unknown", mission: null, events: [], block: null, sender: null, replacedBy: null, ...patch });
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchLaunchStatus.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("watching a transaction on the page", () => {
  it("never turns a long silence into a failure: it says it's slow and keeps checking until a receipt answers", async () => {
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "unknown" }));
    const { result } = renderHook(() => useTxStatus(HASH));
    await advance(STALL_MS + 10_000);
    expect(result.current).toMatchObject({ state: "unknown", stalled: true });
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "confirmed", events: [{ kind: "extended", token: "0x1", lockEnd: 1 }], block: 9 }));
    await advance(6_000);
    expect(result.current).toMatchObject({ state: "confirmed", stalled: false, events: [{ kind: "extended" }] });
    // Settled: nothing more is asked.
    const asked = mocks.fetchLaunchStatus.mock.calls.length;
    await advance(60_000);
    expect(mocks.fetchLaunchStatus).toHaveBeenCalledTimes(asked);
  });

  it("sends back the sender and nonce an earlier answer gave, and keeps going through failed checks", async () => {
    mocks.fetchLaunchStatus.mockResolvedValueOnce(answer({ state: "pending", sender: SENDER })).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(answer({ state: "pending" }));
    const { result } = renderHook(() => useTxStatus(HASH));
    await advance(2_100);
    expect(result.current).toMatchObject({ state: "pending", unreachable: true });
    await advance(2_100);
    expect(mocks.fetchLaunchStatus).toHaveBeenNthCalledWith(1, HASH, null);
    expect(mocks.fetchLaunchStatus).toHaveBeenLastCalledWith(HASH, SENDER);
    expect(result.current).toMatchObject({ state: "pending", unreachable: false });
  });

  it("shows the wallet's replacement and its result, not the original's silence", async () => {
    const other = `0x${"99".repeat(32)}`;
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "confirmed", replacedBy: other }));
    const { result } = renderHook(() => useTxStatus(HASH));
    await advance(10);
    expect(result.current).toMatchObject({ state: "confirmed", replacedBy: other });
  });
});

describe("waiting for a transaction inside a run", () => {
  it("waits as long as it takes, says once that it's slow, and returns the late receipt", async () => {
    mocks.fetchLaunchStatus.mockResolvedValueOnce(answer({ state: "pending", sender: SENDER })).mockResolvedValue(answer({ state: "unknown" }));
    const onStall = vi.fn();
    const waiting = settled(HASH, { onStall });
    await vi.advanceTimersByTimeAsync(STALL_MS + 60_000);
    expect(onStall).toHaveBeenCalledTimes(1);
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "confirmed", block: 12 }));
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(waiting).resolves.toMatchObject({ state: "confirmed", block: 12, replacedBy: null });
    expect(mocks.fetchLaunchStatus).toHaveBeenLastCalledWith(HASH, SENDER);
  });

  it("stops when told to, without calling it failed", async () => {
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "pending" }));
    const control = new AbortController();
    const waiting = settled(HASH, { signal: control.signal });
    const outcome = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(5_000);
    control.abort();
    await outcome;
  });
});
