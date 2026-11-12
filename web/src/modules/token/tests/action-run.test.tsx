import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionRequest, TxEventJson } from "@/shared/tonk/mission";
import type { LaunchStatus, UnsignedTx } from "@/shared/tonk/types";
import { actionFromUrl, didAction, useAction } from "../hooks/useAction";

const mocks = vi.hoisted(() => ({ buildAction: vi.fn(), fetchLaunchStatus: vi.fn(), send: vi.fn(), params: new URLSearchParams(), setParams: vi.fn() }));
vi.mock("@/shared/wallet/wallet", () => ({ wallet: { sendEvmTransaction: mocks.send } }));
vi.mock("@/shared/tonk/api", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/api")>()), buildAction: mocks.buildAction, fetchLaunchStatus: mocks.fetchLaunchStatus }));
// The URL as Next.js reports it: here it never catches up with what the page wrote.
vi.mock("@/modules/shell/hooks/useUrlParams", () => ({ useUrlParams: () => ({ params: mocks.params, setParams: mocks.setParams }) }));

const OWNER = "0xd0d0620Bcf60F15a0aC75753fCc0EbF2d65b268f";
const PAD = "0xB9bb81242ce7B40775CEADF3b591411f0320Ec82";
const TOKEN_A = "0xEaC30db90c3ac240D0122a07e46be8C161051A8A";
const TOKEN_B = "0x9c31222B0b6F9719B585eb912da44A03cE79a1e4";
const SENT = `0x${"85".repeat(32)}`;
const OTHER = `0x${"99".repeat(32)}`;
const EXTEND: ActionRequest = { kind: "extend", token: TOKEN_A, owner: OWNER, days: 7 };
/** The extension for token A as the server built it. */
const TX: UnsignedTx = { to: PAD, data: "0x9d1b464a00aa", value: "0", gas: "120000" };
const extended = (token: string): TxEventJson => ({ kind: "extended", token, lockEnd: 1_811_151_072 });
const settles = (patch: Partial<LaunchStatus>) => mocks.fetchLaunchStatus.mockResolvedValue({ state: "confirmed", mission: null, events: [], block: 1, sender: null, replacedBy: null, replacedCall: null, ...patch });

beforeEach(() => {
  mocks.buildAction.mockReset().mockResolvedValue({ tx: TX });
  mocks.send.mockReset().mockResolvedValue(SENT);
  mocks.fetchLaunchStatus.mockReset();
  mocks.setParams.mockReset();
  mocks.params = new URLSearchParams();
});

async function run(request: ActionRequest = EXTEND) {
  const onDone = vi.fn();
  const hook = renderHook(() => useAction(onDone));
  await act(async () => void (await hook.result.current.start(request)));
  await waitFor(() => expect(["done", "failed"]).toContain(hook.result.current.state.step));
  return { state: hook.result.current.state, onDone };
}

describe("an action the wallet replaced", () => {
  it("counts a sped-up copy of the very same call as done, under the hash that landed", async () => {
    settles({ events: [extended(TOKEN_A)], replacedBy: OTHER, replacedCall: { to: PAD, data: TX.data, value: "0" } });
    const { state, onDone } = await run();
    expect(state).toMatchObject({ step: "done", hash: OTHER });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("never counts the same kind of action on another token as this one (Astra's R1)", async () => {
    settles({ events: [extended(TOKEN_B)], replacedBy: OTHER, replacedCall: { to: PAD, data: "0x9d1b464a00bb", value: "0" } });
    const { state, onDone } = await run();
    expect(state).toMatchObject({ step: "failed", error: "replaced" });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("calls a cancellation replaced", async () => {
    settles({ events: [], replacedBy: OTHER, replacedCall: { to: OWNER, data: "0x", value: "0" } });
    expect((await run()).state).toMatchObject({ step: "failed", error: "replaced" });
  });

  it("with the replacement's call unreadable, counts only this action on this token for this wallet", async () => {
    settles({ events: [extended(TOKEN_B)], replacedBy: OTHER, replacedCall: null });
    expect((await run()).state).toMatchObject({ step: "failed", error: "replaced" });
    settles({ events: [extended(TOKEN_A)], replacedBy: OTHER, replacedCall: null });
    expect((await run()).state).toMatchObject({ step: "done", hash: OTHER });
  });

  it("reports a revert as a revert, and its own confirmed receipt as done", async () => {
    settles({ state: "failed" });
    expect((await run()).state).toMatchObject({ step: "failed", error: "reverted", hash: SENT });
    settles({ events: [extended(TOKEN_A)] });
    expect((await run()).state).toMatchObject({ step: "done", hash: SENT });
  });
});

describe("what each action leaves in its receipt", () => {
  it("is its own kind, on its token, for its wallet", () => {
    expect(didAction({ kind: "claim", token: TOKEN_A, owner: OWNER }, [{ kind: "claimed", token: TOKEN_A, amount: "1" }])).toBe(true);
    expect(didAction({ kind: "claim", token: TOKEN_A, owner: OWNER }, [{ kind: "claimed", token: TOKEN_B, amount: "1" }])).toBe(false);
    expect(didAction({ kind: "rewards", token: TOKEN_A, owner: OWNER }, [{ kind: "rewards", token: TOKEN_A, holder: PAD, amount: "1" }])).toBe(false);
    expect(didAction({ kind: "withdraw", owner: OWNER }, [{ kind: "withdrawn", recipient: OWNER.toLowerCase(), amount: "1" }])).toBe(true);
    expect(didAction(EXTEND, [{ kind: "edited", token: TOKEN_A }])).toBe(false);
    const shared = { kind: "shared", protocolEth: "1", crewEth: "0", creatorEth: "1", tokensBurned: "0" } as const;
    expect(didAction({ kind: "share", token: TOKEN_A, owner: OWNER }, [{ ...shared, token: TOKEN_A.toLowerCase() }])).toBe(true);
    expect(didAction({ kind: "share", token: TOKEN_A, owner: OWNER }, [{ ...shared, token: TOKEN_B }])).toBe(false);
  });
});

describe("an action's hash in the URL (campaign round 1)", () => {
  it("goes into the URL once the wallet has sent it, and leaves it when the person stops watching", async () => {
    settles({ events: [extended(TOKEN_A)] });
    const onDone = vi.fn();
    const hook = renderHook(() => useAction(onDone, { token: TOKEN_A, owner: OWNER }));
    await act(async () => void (await hook.result.current.start(EXTEND)));
    expect(mocks.setParams).toHaveBeenCalledWith({ action: `extend:${SENT}` });
    await waitFor(() => expect(hook.result.current.state.step).toBe("done"));
    act(() => hook.result.current.reset());
    expect(mocks.setParams).toHaveBeenLastCalledWith({ action: null });
  });

  it("after a reload, watches the same hash again with every action held, and sends nothing", async () => {
    mocks.params = new URLSearchParams({ action: `extend:${SENT}` });
    let land: (status: LaunchStatus) => void = () => {};
    mocks.fetchLaunchStatus.mockImplementation(() => new Promise<LaunchStatus>((resolve) => (land = resolve)));
    const onDone = vi.fn();
    const hook = renderHook(() => useAction(onDone, { token: TOKEN_A, owner: OWNER }));
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ step: "confirming", kind: "extend", hash: SENT }));
    expect(mocks.fetchLaunchStatus).toHaveBeenCalledWith(SENT, null);
    await act(async () => land({ state: "confirmed", mission: null, events: [extended(TOKEN_A)], block: 1, sender: null, replacedBy: null, replacedCall: null }));
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ step: "done", hash: SENT }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mocks.buildAction).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("takes the same hash up again after a remount, as React's strict mode does, instead of leaving it stuck", async () => {
    mocks.params = new URLSearchParams({ action: `extend:${SENT}` });
    settles({ events: [extended(TOKEN_A)] });
    const hook = renderHook(() => useAction(vi.fn(), { token: TOKEN_A, owner: OWNER }), { reactStrictMode: true });
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ step: "done", hash: SENT }));
  });

  it("after a reload, counts a replacement only if its receipt shows this action on this token", async () => {
    mocks.params = new URLSearchParams({ action: `extend:${SENT}` });
    settles({ events: [extended(TOKEN_B)], replacedBy: OTHER, replacedCall: { to: PAD, data: TX.data, value: "0" } });
    const hook = renderHook(() => useAction(vi.fn(), { token: TOKEN_A, owner: OWNER }));
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ step: "failed", error: "replaced" }));
  });

  it("reads only a known action and a real hash", () => {
    expect(actionFromUrl(`withdraw:${SENT}`)).toEqual({ kind: "withdraw", hash: SENT });
    expect(actionFromUrl(`drain:${SENT}`)).toBeNull();
    expect(actionFromUrl("extend:0x1234")).toBeNull();
    expect(actionFromUrl(null)).toBeNull();
  });
});
