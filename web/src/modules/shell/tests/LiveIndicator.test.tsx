import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveIndicator } from "../components/LiveIndicator";
import { ShellLiveProvider } from "../live/ShellLive";

const SHELL = { tape: [], chainCounts: { all: 1, sol: 1, rh: 0 }, status: { solUsd: 90, ethUsd: 2_200, rhGasGwei: 0.02 } };

describe("the status bar's Live indicator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("says Live on mock data, where nothing is fetched", () => {
    render(<LiveIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent("Live");
  });

  it("says Reconnecting while the worker can't be reached, and Live again once it answers", async () => {
    vi.useFakeTimers();
    let up = false;
    vi.stubGlobal("fetch", async () => (up ? new Response(JSON.stringify(SHELL)) : new Response("down", { status: 502 })));
    render(
      <ShellLiveProvider live>
        <LiveIndicator />
      </ShellLiveProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
    up = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Live");
  });
});
