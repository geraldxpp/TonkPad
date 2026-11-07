import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatChange, formatUsdCompact } from "@/shared/lib/format";
import { ExploreLoading } from "../components/ExploreLoading";
import { LaunchpadChips } from "../components/LaunchpadChips";
import { LiveScope } from "../components/LiveScope";
import { TokenListView, type TokenListViewProps } from "../components/TokenListView";
import { LAUNCHPAD_COUNTS, TOKENS } from "../data/explore.mock";
import type { RankedToken } from "../lib/filter";
import { liveListUrl } from "../lib/live";
import { DEFAULT_VIEW, paramsFromRecord } from "../lib/view";
import { tokenWindow } from "../lib/window";

/** A mock token as the live worker sends it: a real address and per-timeframe figures. */
const LIVE: RankedToken = {
  ...TOKENS[1],
  address: "GaWkukPjMKDyphGq6vMu4f1DmoWqv4jv5s9GyLTpo2FN",
  windows: { "5m": { change: -3.25, volume: 1_234 }, "24h": { change: 88, volume: 99_000 } },
  rank: 1,
};

function renderLive(props: Partial<TokenListViewProps> = {}) {
  const result = render(
    <TokenListView
      rows={[LIVE]}
      view={DEFAULT_VIEW}
      launchpads={[...LAUNCHPAD_COUNTS]}
      moreLaunchpads={0}
      totalTokens={250}
      {...props}
    />,
  );
  return { ...result, desktop: result.container.querySelector<HTMLElement>('[data-variant="table"]')! };
}

describe("live token list", () => {
  it("labels the change column with the timeframe and shows that window's figures", () => {
    const { desktop } = renderLive({ view: { ...DEFAULT_VIEW, tf: "5m" } });
    expect(within(desktop).getAllByRole("columnheader")[5]).toHaveTextContent("5m");
    const row = within(desktop).getAllByRole("row")[1];
    expect(row).toHaveTextContent(formatChange(-3.25));
    expect(row).toHaveTextContent(formatUsdCompact(1_234, { trimZeros: true }));
    expect(within(row).getByRole("link", { name: LIVE.name })).toHaveAttribute("href", `/token/${LIVE.address}`);
  });

  it("keeps the 24h label and falls back to 24h figures for mock tokens", () => {
    expect(tokenWindow(TOKENS[0], "1h")).toEqual({ change: TOKENS[0].change24h, volume: TOKENS[0].volume24h });
    expect(tokenWindow(LIVE, "24h")).toEqual({ change: 88, volume: 99_000 });
    const { desktop } = renderLive();
    expect(within(desktop).getAllByRole("columnheader")[5]).toHaveTextContent("24h");
  });

  it("marks the panel busy while a view loads and holds back the empty state", () => {
    const { container } = renderLive({ rows: [], busy: true });
    expect(container.querySelector("#token-panel")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No tokens match these filters")).not.toBeInTheDocument();
  });

  it("offers Load more only while there is more to load", () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderLive({ onLoadMore, hasMore: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(
      <TokenListView rows={[LIVE]} view={DEFAULT_VIEW} launchpads={[...LAUNCHPAD_COUNTS]} moreLaunchpads={0} totalTokens={250} hasMore={false} />,
    );
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("says updates are paused when a refresh fails, and keeps the last rows", () => {
    renderLive({ stale: true, hasMore: false });
    expect(screen.getByText("Showing 1 of 250 tokens · updates paused, retrying…")).toBeInTheDocument();
    expect(screen.getAllByText(LIVE.name).length).toBeGreaterThan(0);
  });

  it("says live data is unavailable, not that nothing matches, when a view never loaded", () => {
    renderLive({ rows: [], stale: true });
    expect(screen.getByText("Live data is unavailable right now. Retrying…").closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText("No tokens match these filters")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });

  it("shows the offline screen when the worker can't be reached on first load", () => {
    render(<ExploreLoading offline />);
    expect(screen.getByRole("status")).toHaveTextContent("Live data is unavailable right now. Retrying…");
  });

  it("drops '+0 more' from the chips and the scope subtitle", () => {
    render(<LaunchpadChips launchpads={[...LAUNCHPAD_COUNTS]} more={0} active="all" />);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
    render(<LiveScope blips={[]} scope={{ pads: ["Pump.fun", "Bonk.fun"], more: 0 }} />);
    expect(screen.getByText("Sweeping Pump.fun, Bonk.fun")).toBeInTheDocument();
  });
});

describe("live view URLs", () => {
  it("asks the API for a view in a fixed key order", () => {
    expect(liveListUrl({ ...DEFAULT_VIEW, limit: 10 })).toBe("/api/live/list?chain=all&pad=all&tab=trending&tf=24h&q=&limit=10");
    expect(liveListUrl({ ...DEFAULT_VIEW, q: "sol cat", limit: 20 })).toContain("q=sol+cat&limit=20");
  });

  it("reads a page's search params like URLSearchParams", () => {
    const params = paramsFromRecord({ tab: ["new", "gainers"], q: undefined, tf: "5m" });
    expect([params.get("tab"), params.get("q"), params.get("tf")]).toEqual(["new", null, "5m"]);
  });
});
