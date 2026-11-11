import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LaunchStatus } from "@/shared/tonk/types";
import { useSentTrade } from "../hooks/useSentTrade";

const mocks = vi.hoisted(() => ({ fetchLaunchStatus: vi.fn(), params: new URLSearchParams(), setParams: vi.fn() }));
vi.mock("@/shared/tonk/api", () => ({ fetchLaunchStatus: mocks.fetchLaunchStatus }));
// The URL as Next.js reports it: here it never catches up with what the page wrote.
vi.mock("@/modules/shell/hooks/useUrlParams", () => ({ useUrlParams: () => ({ params: mocks.params, setParams: mocks.setParams }) }));

const SALE = `0x${"aa".repeat(32)}`;
const GRADUATION = `0x${"37".repeat(32)}`;
const answer = (patch: Partial<LaunchStatus>): LaunchStatus => ({ state: "pending", mission: null, events: [], block: null, sender: null, replacedBy: null, ...patch });

beforeEach(() => {
  mocks.fetchLaunchStatus.mockReset();
  mocks.setParams.mockReset();
  mocks.params = new URLSearchParams({ tx: SALE });
});

describe("the trade a page sent", () => {
  it("follows the trade it just sent at once, even before the URL catches up, and never shows the last trade's answer on it", async () => {
    // Astra's case: a sale, then the buy that graduated the token; the card kept the sale's link and a stale failure.
    let finishSale: (status: LaunchStatus) => void = () => {};
    mocks.fetchLaunchStatus.mockImplementation((hash: string) => (hash === SALE ? new Promise<LaunchStatus>((resolve) => (finishSale = resolve)) : Promise.resolve(answer({ state: "pending" }))));
    const { result } = renderHook(() => useSentTrade(vi.fn()));
    expect(result.current.sent?.hash).toBe(SALE);
    act(() => result.current.send(GRADUATION));
    expect(mocks.setParams).toHaveBeenCalledWith({ tx: GRADUATION });
    expect(result.current.sent?.hash).toBe(GRADUATION);
    // The sale's answer arrives late; it cannot land on the graduation's card.
    await act(async () => {
      finishSale(answer({ state: "replaced" }));
      await Promise.resolve();
    });
    expect(result.current.sent).toMatchObject({ hash: GRADUATION, waiting: true });
    expect(result.current.sent?.tx.state).not.toBe("replaced");
    act(() => result.current.dismiss());
    expect(result.current.sent).toBeNull();
    expect(mocks.setParams).toHaveBeenLastCalledWith({ tx: null });
  });

  it("goes on watching a reloaded page's trade from the URL, and sends nothing", async () => {
    mocks.fetchLaunchStatus.mockResolvedValue(answer({ state: "confirmed" }));
    const onConfirmed = vi.fn();
    const { result } = renderHook(() => useSentTrade(onConfirmed));
    await act(async () => void (await Promise.resolve()));
    expect(result.current.sent).toMatchObject({ hash: SALE, waiting: false });
    expect(onConfirmed).toHaveBeenCalled();
  });
});
