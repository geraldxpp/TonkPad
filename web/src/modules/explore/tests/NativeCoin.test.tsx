import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "../components/Hero";
import { getExploreData } from "../data/get-explore-data";

describe("Tonkpad coin slot", () => {
  it("shows the Tonkpad emblem with Coming soon where the Mission Pick was", async () => {
    const data = await getExploreData();
    render(<Hero stats={data.stats} trackedToday={data.totalTokens} />);
    const card = screen.getByRole("region", { name: "Tonkpad native coin, coming soon" });
    expect(within(card).getByText("Native coin")).toBeInTheDocument();
    expect(within(card).getByText("Tonkpad")).toBeInTheDocument();
    expect(within(card).getByText("Coming soon")).toBeInTheDocument();
    expect(card.querySelector("img")).toHaveAttribute("alt", "");
    // Nothing to buy yet: the slot no longer links to a token.
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Mission pick/i)).not.toBeInTheDocument();
  });
});
