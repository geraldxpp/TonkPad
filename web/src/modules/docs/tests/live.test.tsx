import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import type { DocsData } from "../data/get-docs-data";
import { DocsView } from "../DocsView";

// The shell's live data: the ETH price mainnet counts dollars at.
const shell = vi.hoisted(() => ({ value: { live: true, data: null as { status: { ethUsd: number | null } } | null, failed: false } }));
vi.mock("@/modules/shell/live/ShellLive", () => ({ useShellLive: () => shell.value }));

const MAINNET: DocsData = { source: "live", mode: "mainnet", chainName: "Robinhood Chain", unit: "ETH", settings: null, inviteOnly: true, contracts: [] };

/** What the deployed launchpad answers on /api/tonk/settings: 0.005 ETH to launch, 1 ETH and 1.073B tokens of virtual reserves. */
const READ: TonkSettingsJson = {
  chainId: 4663,
  launchFee: "5000000000000000",
  virtualEth: "1000000000000000000",
  virtualTokens: "1073000000000000000000000000",
  paused: false,
  gasPrice: "10000000",
  readAt: 1,
};

const figure = (key: string) => document.querySelector(`[data-figure="${key}"]`)?.textContent ?? null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  shell.value = { live: true, data: { status: { ethUsd: 3000 } }, failed: false };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the live figures", () => {
  it("come from the launchpad's settings, read once for the whole page, in dollars at the live ETH price", async () => {
    const fetchMock = vi.fn(async () => json({ ...READ, launchFee: "7000000000000000", paused: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocsView t={en} href={(path) => path} data={MAINNET} />);
    expect(figure("fee")).toBe("Reading the launchpad…");
    await waitFor(() => expect(figure("fee")).toBe("0.007 ETH≈ $21.00"));
    expect(figure("reserves")).toBe("1 ETH and 1,073,000,000 tokens, virtual");
    expect(figure("status")).toBe("Paused: launches and buys are on hold, selling stays open");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/tonk/settings", expect.anything()]);
    expect(screen.getAllByText("Read live from the launchpad on Robinhood Chain.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Launch is invite-only for now.").length).toBe(1);
  });

  it("say they're unavailable when the launchpad can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "unavailable" }, 503)));
    render(<DocsView t={en} href={(path) => path} data={MAINNET} />);
    await waitFor(() => expect(figure("fee")).toBe("Unavailable right now"));
    for (const key of ["reserves", "startCap", "graduation", "status", "reserveNow", "maxCurve"]) expect(figure(key)).toBe("Unavailable right now");
    expect(screen.queryByText(/0\.005/)).toBeNull();
  });

  it("keep the ETH figures when the ETH price is missing, and say the dollar value is unavailable", async () => {
    shell.value = { live: true, data: { status: { ethUsd: null } }, failed: false };
    vi.stubGlobal("fetch", vi.fn(async () => json(READ)));
    render(<DocsView t={en} href={(path) => path} data={MAINNET} />);
    await waitFor(() => expect(figure("fee")).toBe("0.005 ETHDollar value unavailable"));
  });

  it("on the testnet site count in test ETH, with no dollars at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...READ, chainId: 46630, launchFee: "100000000000000" })));
    render(<DocsView t={en} href={(path) => path} data={{ ...MAINNET, mode: "testnet", chainName: "Robinhood Chain Testnet", unit: "test ETH" }} />);
    await waitFor(() => expect(figure("fee")).toBe("0.0001 test ETH"));
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});
