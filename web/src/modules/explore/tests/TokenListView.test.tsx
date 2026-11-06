import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LAUNCHPAD_COUNTS, MORE_LAUNCHPADS, TOKENS, TOTAL_TOKENS } from "../data/explore.mock";
import { TokenListView } from "../components/TokenListView";
import { filterTokens } from "../lib/filter";
import { DEFAULT_VIEW, type ExploreView } from "../lib/view";

function renderList(patch: Partial<ExploreView> = {}, handlers: { onReset?: () => void } = {}) {
  const view = { ...DEFAULT_VIEW, ...patch };
  return render(
    <TokenListView
      rows={filterTokens(TOKENS, view)}
      view={view}
      launchpads={[...LAUNCHPAD_COUNTS]}
      moreLaunchpads={MORE_LAUNCHPADS}
      totalTokens={TOTAL_TOKENS}
      {...handlers}
    />,
  );
}

describe("TokenListView", () => {
  it("renders the 11 columns and 10 rows with the footer count", () => {
    renderList();
    const table = screen.getByRole("table", { name: "Tokens" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#",
      "Token",
      "Bonding curve",
      "Mission score",
      "Last 24h",
      "24h",
      "Volume",
      "Holders",
      "Smart money",
      "Market cap",
      "Quick buy",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Showing 10 of 8,412 tokens · refreshes every 4s")).toBeInTheDocument();
  });

  it("links token names to /token/<TICKER>", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Ghosty" })).toHaveAttribute("href", "/token/GHOST");
    expect(screen.getByRole("link", { name: "Sol Cat" })).toHaveAttribute("href", "/token/SCAT");
  });

  it("labels Quick buy with the chain's amount", () => {
    renderList();
    expect(screen.getByRole("button", { name: "Quick buy 0.01 ETH of GHOST" })).toHaveTextContent("0.01");
    expect(screen.getByRole("button", { name: "Quick buy 0.5 SOL of SCAT" })).toHaveTextContent("0.5");
  });

  it("marks the active tab, timeframe and launchpad", () => {
    renderList({ tab: "locked", tf: "1h", pad: "pons" });
    expect(screen.getByRole("tab", { name: "Locked Missions" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "1h" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Pons/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "token-tab-locked");
  });

  it("shows the empty state with Reset filters", () => {
    const onReset = vi.fn();
    renderList({ chain: "sol", pad: "pons" }, { onReset });
    expect(screen.getByText("No tokens match these filters")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 8,412 tokens · refreshes every 4s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
