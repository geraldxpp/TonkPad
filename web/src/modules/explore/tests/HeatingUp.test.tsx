import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeatingUp } from "../components/HeatingUp";
import { getExploreData } from "../data/get-explore-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HeatingUp", () => {
  it("loops the full set of cards with hidden copies for a seamless glide", async () => {
    // jsdom has no IntersectionObserver; the glide only needs it to pause off screen.
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    const { heating } = await getExploreData();
    const { container } = render(<HeatingUp cards={heating} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(container.querySelectorAll("a")).toHaveLength(15);
    expect(container.querySelectorAll("[inert]")).toHaveLength(2);
  });

  it("shows a short set once, without duplicates", async () => {
    const { heating } = await getExploreData();
    const { container } = render(<HeatingUp cards={heating.slice(0, 1)} />);
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("[inert]")).toHaveLength(0);
  });
});
