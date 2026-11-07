import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/shared/ui/Badge";
import { TokenCard } from "../components/TokenCard";
import { TokenRow } from "../components/TokenRow";
import { TokenRowCompact } from "../components/TokenRowCompact";
import { getExploreData } from "../data/get-explore-data";

describe("Verified RWA badge", () => {
  it("names the issuer in its tooltip", () => {
    render(<Badge kind="rwa" value="xStocks" />);
    expect(screen.getByText("Verified RWA")).toHaveAttribute("title", "Verified RWA · issued by xStocks");
  });

  it("shows on a verified issuer's row, compact row and card, and nowhere else", async () => {
    const [plain] = (await getExploreData()).tokens;
    const stock = { ...plain, issuer: "Ondo Global Markets" };

    const { unmount } = render(<TokenRow token={{ ...plain, rank: 1 }} tf="24h" />);
    expect(screen.queryByText("Verified RWA")).not.toBeInTheDocument();
    unmount();

    render(<TokenRow token={{ ...stock, rank: 1 }} tf="24h" />);
    expect(screen.getByText("Verified RWA")).toHaveAttribute("title", "Verified RWA · issued by Ondo Global Markets");

    render(<TokenRowCompact token={{ ...stock, rank: 1 }} tf="24h" />);
    expect(screen.getByRole("img", { name: "Verified RWA" }).parentElement).toHaveAttribute(
      "title",
      "Verified RWA · issued by Ondo Global Markets",
    );

    render(<TokenCard token={stock} color="#101820" rank={1} />);
    expect(screen.getAllByText("Verified RWA")).toHaveLength(2);
  });
});
