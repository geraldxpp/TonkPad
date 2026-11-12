import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TokenDetail } from "@/shared/types/token-detail";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=traders") }));

import { ActivityCard } from "../components/activity/ActivityCard";
import { liveDetail, SOL_ADDRESS } from "./live.fixture";

const TRADER = { address: "Wallet111111111111111111111111111111111111111", tag: null, pnlUsd: 120, boughtUsd: 80, soldUsd: 200, winRate: 1 } as const;

function detail(patch: Partial<TokenDetail>): TokenDetail {
  return { ...liveDetail(SOL_ADDRESS), topTraders: [TRADER], ...patch };
}

describe("the Top traders note", () => {
  it("says how far back the ranking reaches where only part of a token's trades are known", () => {
    const d = detail({});
    render(<ActivityCard detail={{ ...d, tradersSince: d.updatedAt - 12 * 60_000 }} />);
    expect(screen.getByText("Ranked by realised profit on the trades of the last 12m. Wallets that bought before then aren't ranked.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Top traders" })).toBeInTheDocument();
  });

  it("says nothing where every trade is known", () => {
    render(<ActivityCard detail={detail({ tradersSince: null })} />);
    expect(screen.queryByText(/Ranked by realised profit/)).toBeNull();
  });
});
