import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LAUNCHPAD_COUNTS, MORE_LAUNCHPADS, TOKENS, TOTAL_TOKENS } from "../data/explore.mock";
import { TokenListView } from "../components/TokenListView";
import { filterTokens } from "../lib/filter";
import { DEFAULT_VIEW, type ExploreView } from "../lib/view";

function renderList(patch: Partial<ExploreView> = {}, handlers: { onReset?: () => void } = {}) {
  const view = { ...DEFAULT_VIEW, ...patch };
  const result = render(
    <TokenListView
      rows={filterTokens(TOKENS, view)}
      view={view}
      launchpads={[...LAUNCHPAD_COUNTS]}
      moreLaunchpads={MORE_LAUNCHPADS}
      totalTokens={TOTAL_TOKENS}
      {...handlers}
    />,
  );
  // jsdom applies no CSS, so both layouts are present: the desktop table and the phone list.
  const desktop = result.container.querySelector<HTMLElement>('[data-variant="table"]')!;
  const phone = result.container.querySelector<HTMLElement>('[data-variant="list"]')!;
  return { ...result, desktop, phone };
}

describe("TokenListView — desktop table", () => {
  it("renders the 11 columns and 10 rows with the footer count", () => {
    const { desktop } = renderList();
    expect(desktop).toHaveAttribute("role", "table");
    expect(desktop).toHaveAttribute("aria-label", "Tokens");
    expect(within(desktop).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
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
      "Details",
    ]);
    expect(within(desktop).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Showing 10 of 8,412 tokens · refreshes every 4s")).toBeInTheDocument();
  });

  it("links token names to /token/<TICKER>", () => {
    const { desktop } = renderList();
    expect(within(desktop).getByRole("link", { name: "Ghosty" })).toHaveAttribute("href", "/token/GHOST");
    expect(within(desktop).getByRole("link", { name: "Sol Cat" })).toHaveAttribute("href", "/token/SCAT");
  });

  it("ends each row with an arrow that opens the token", () => {
    const { desktop } = renderList();
    expect(within(desktop).getByRole("link", { name: "Open GHOST" })).toHaveAttribute("href", "/token/GHOST");
    expect(within(desktop).getByRole("link", { name: "Open SCAT" })).toHaveAttribute("href", "/token/SCAT");
  });
});

describe("TokenListView — phone list", () => {
  it("has four columns: Token, Market cap, 24h and the open arrow", () => {
    const { phone } = renderList();
    expect(phone).toHaveAttribute("aria-label", "Tokens");
    expect(within(phone).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Token",
      "Market cap",
      "24h",
      "Details",
    ]);
    expect(within(phone).getAllByRole("row")).toHaveLength(11);
  });

  it("shows name, marks, ticker · age, market cap and change on each row", () => {
    const { phone } = renderList();
    const ghosty = within(phone).getByRole("link", { name: "Ghosty" }).closest('[role="row"]') as HTMLElement;
    expect(within(ghosty).getByRole("img", { name: "Hot" })).toBeInTheDocument();
    expect(within(ghosty).getByRole("img", { name: "Locked" })).toBeInTheDocument();
    expect(ghosty).toHaveTextContent("GHOST·18d");
    expect(ghosty).toHaveTextContent("$58.2K");
    expect(ghosty).toHaveTextContent("+412.6%");
    expect(within(ghosty).getByRole("link", { name: "Open GHOST" })).toHaveAttribute("href", "/token/GHOST");
  });

  it("follows the same filtered rows as the table", () => {
    const { phone, desktop } = renderList({ tab: "locked" });
    // Each row has two links to the token: its name and the open arrow (named by aria-label, no text).
    const names = (el: HTMLElement) =>
      within(el)
        .getAllByRole("link")
        .map((a) => a.textContent)
        .filter(Boolean);
    expect(names(phone)).toEqual(["Ghosty", "Orbit", "Sparky", "Tide"]);
    expect(names(phone)).toEqual(names(desktop));
  });
});

describe("TokenListView — toolbar and empty state", () => {
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
