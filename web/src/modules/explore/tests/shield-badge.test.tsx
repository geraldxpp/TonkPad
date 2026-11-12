import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenRow } from "../components/TokenRow";
import { getExploreData } from "../data/get-explore-data";

describe("Block-0 Shield badge", () => {
  it("shows on a live tonkfun.fun launch's row with its tooltip, and not on the design's mock rows", async () => {
    const [ghosty] = (await getExploreData()).tokens;
    expect(ghosty.launchpad).toBe("tonk");
    const { unmount } = render(<TokenRow token={{ ...ghosty, rank: 1 }} tf="24h" />);
    expect(screen.queryByText("Block-0 Shield")).not.toBeInTheDocument();
    unmount();

    render(<TokenRow token={{ ...ghosty, shield: true, rank: 1 }} tf="24h" />);
    expect(screen.getByText("Block-0 Shield").closest("[title]")).toHaveAttribute("title", expect.stringContaining("99% tax"));
  });
});
