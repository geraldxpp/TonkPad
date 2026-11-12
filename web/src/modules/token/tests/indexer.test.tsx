import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TokenDetail, TokenHolder, TopTrader } from "@/shared/types/token-detail";
import { HoldersTable } from "../components/activity/HoldersTable";
import { TradersTable } from "../components/activity/TradersTable";
import { getTokenData } from "../data/get-token-data";
import { indexerViewOf, withIndexer } from "../lib/indexer";

const TOKEN = "0x1111111111111111111111111111111111111111";
const LAUNCHPAD = "0xbcaf0ecf36d15622a13d04b5ac58d312818bb4f0";
const ALICE = "0x00000000000000000000000000000000000a11ce";

const holders: TokenHolder[] = [
  { address: "0x8366a39cc670b4001a1121b8f6a443a643e40951", label: "pool", tag: null, share: 0.2, tokens: 200_000_000, crewEarned: null },
  { address: ALICE, tag: null, share: 0.05, tokens: 50_000_000, crewEarned: null },
  { address: LAUNCHPAD, label: "locked", tag: "devLock", share: 0.04, tokens: 40_000_000, crewEarned: null },
  { address: "0x0000000000000000000000000000000000000b0b", tag: "sniper", share: 0.01, tokens: 10_000_000, crewEarned: null },
];

/** A worker answer for a launch, built on the mock detail's shape. */
async function answer(overrides: Partial<TokenDetail["token"]> = {}): Promise<TokenDetail> {
  const base = (await getTokenData("GHOST"))!;
  return {
    ...base,
    source: "live",
    contract: TOKEN,
    token: { ...base.token, address: TOKEN, chain: "rh", launchpad: "tonk", holders: 2, ...overrides },
    stats: { ...base.stats, top10Share: 0.06 },
    holders,
    topTraders: [{ address: ALICE, tag: null, pnlUsd: 120, boughtUsd: 300, soldUsd: 420, winRate: 1, held: 0 }],
  };
}

describe("the indexer's view of a launch on its token page", () => {
  it("takes the worker's holders, top traders, count and top-10 share for this launch only", async () => {
    const body = JSON.parse(JSON.stringify(await answer()));
    const view = indexerViewOf(body, TOKEN);
    expect(view).toMatchObject({ status: "ok", holderCount: 2, top10Share: 0.06 });
    expect(indexerViewOf(body, "0x2222222222222222222222222222222222222222")).toEqual({ status: "unavailable" });
    expect(indexerViewOf({ error: "live data unavailable" }, TOKEN)).toEqual({ status: "unavailable" });
    expect(indexerViewOf(null, TOKEN)).toEqual({ status: "unavailable" });
    // Another launchpad's token at this address isn't this launch's indexer view.
    expect(indexerViewOf(JSON.parse(JSON.stringify(await answer({ launchpad: "pons" }))), TOKEN)).toEqual({ status: "unavailable" });
  });

  it("merges into the chain's figures, and leaves them as they are until the worker answers", async () => {
    const page = await answer({ holders: null });
    const merged = withIndexer({ ...page, holders: [], topTraders: [], stats: { ...page.stats, top10Share: null } }, indexerViewOf(JSON.parse(JSON.stringify(await answer())), TOKEN));
    expect([merged.token.holders, merged.stats.top10Share, merged.holders.length, merged.topTraders.length]).toEqual([2, 0.06, 4, 1]);
    expect(withIndexer(page, { status: "unavailable" })).toBe(page);
    expect(withIndexer(page, { status: "loading" })).toBe(page);
  });

  it("labels system holders by role, without a rank, and ranks the counted ones from 1", () => {
    render(<HoldersTable holders={holders} ticker="TTONE" />);
    const rows = within(screen.getByRole("table", { name: "Holders" })).getAllByRole("row").slice(1);
    const firstCells = rows.map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(firstCells).toEqual(["—", "1", "—", "2"]);
    expect(within(rows[0]).getByText("Uniswap pool")).toHaveAttribute("title", holders[0].address);
    expect(within(rows[2]).getByText("Locked (creator)")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Dev lock")).toBeInTheDocument();
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveAttribute("title", "Held by a contract, so not counted as a holder");
  });

  it("shows what each top trader still holds only where the feed knows it", () => {
    const trader: TopTrader = { address: ALICE, tag: null, pnlUsd: 120, boughtUsd: 300, soldUsd: 420, winRate: 1 };
    const { unmount } = render(<TradersTable traders={[trader]} />);
    expect(screen.queryByRole("columnheader", { name: "Still held" })).not.toBeInTheDocument();
    unmount();
    render(<TradersTable traders={[{ ...trader, held: 1_250_000 }]} />);
    expect(screen.getByRole("columnheader", { name: "Still held" })).toBeInTheDocument();
    expect(screen.getByText("+$120")).toBeInTheDocument();
  });
});
