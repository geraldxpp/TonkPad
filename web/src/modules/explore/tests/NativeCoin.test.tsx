import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "../components/Hero";
import { getExploreData } from "../data/get-explore-data";

describe("Hero", () => {
  it("leads with the headline and the two calls to action", async () => {
    const data = await getExploreData();
    render(<Hero stats={data.stats} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find your next move.");
    expect(screen.getByRole("link", { name: "Explore the market" })).toHaveAttribute("href", "#token-discovery");
    expect(screen.getByRole("link", { name: "Launch a token" })).toHaveAttribute("href", "/launch");
    const market = screen.getByLabelText("Market overview");
    expect(within(market).getByText("tokens today")).toBeInTheDocument();
  });
});

describe("tonkfun.fun coin slot", () => {
  it("shows the tonkfun.fun mark with Coming soon where the Mission Pick was", async () => {
    const data = await getExploreData();
    render(<Hero stats={data.stats} />);
    const card = screen.getByRole("region", { name: "tonkfun.fun native coin, coming soon" });
    expect(within(card).getByText("Native coin")).toBeInTheDocument();
    expect(within(card).getByText("tonkfun.fun")).toBeInTheDocument();
    expect(within(card).getByText("Coming soon")).toBeInTheDocument();
    // The mark is decoration: the region's name already says what it is.
    expect(card.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // Nothing to buy yet: the slot doesn't link to a token.
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Mission pick/i)).not.toBeInTheDocument();
  });
});
