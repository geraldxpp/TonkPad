import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { formatTokensFull } from "@/shared/tonk/format";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import type { PoolQuoteJson } from "@/shared/tonk/pool";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import { PoolTradePanel } from "../components/curve/PoolTradePanel";
import { mission, view } from "./mission.fixture";

const mocks = vi.hoisted(() => ({ fetchPoolQuote: vi.fn(), buildPoolTrade: vi.fn(), fetchSettings: vi.fn() }));

vi.mock("@/shared/wallet/wallet", () => ({ wallet: { connect: vi.fn(), sendEvmTransaction: vi.fn() }, useWallet: () => ({ accounts: {} }) }));
vi.mock("@/shared/tonk/api", async (actual) => ({
  ...(await actual<typeof import("@/shared/tonk/api")>()),
  fetchPoolQuote: mocks.fetchPoolQuote,
  buildPoolTrade: mocks.buildPoolTrade,
  fetchSettings: mocks.fetchSettings,
}));

const SETTINGS: TonkSettingsJson = { chainId: 46630, launchFee: "100000000000000", virtualEth: "1500000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "10000000", readAt: 1 };
const quote = (out: string): PoolQuoteJson => ({ pool: `0x${"11".repeat(32)}`, side: "buy", amountIn: "50000000000000", out, feeBps: 400, block: 1 });
const OPENED = quote("1000000000000000000000000");
const REFRESHED = quote("900000000000000000000000");
const tokens = (wei: string) => `${formatTokensFull(BigInt(wei))} $TTONE`;

// jsdom may not open dialogs: enough of showModal and close for the sheets to appear and go.
beforeAll(() => {
  const dialog = HTMLDialogElement.prototype;
  if (typeof dialog.showModal !== "function") {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    dialog.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchSettings.mockReset().mockResolvedValue(SETTINGS);
  mocks.fetchPoolQuote.mockReset().mockResolvedValueOnce(OPENED).mockResolvedValue(REFRESHED);
  mocks.buildPoolTrade.mockReset().mockResolvedValue({ step: "moved", quote: REFRESHED });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const settle = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("the pool trade review", () => {
  it("sends the minimum it reviewed: the 15-second refresh never changes the review unseen, only the server's moved does", async () => {
    render(<PoolTradePanel mission={mission({ graduated: true })} network={TONK_TESTNET} view={view()} sent={null} onSent={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(en.token.trade.pay), { target: { value: "0.00005" } });
    await settle(400);
    fireEvent.click(screen.getByRole("button", { name: en.mission.trade.reviewBuy }));
    const review = screen.getByRole("dialog", { name: en.swap.reviewTitle });
    // 1% slippage on the quote the review opened on.
    expect(within(review).getByText(tokens("990000000000000000000000"))).toBeVisible();
    // A lower quote arrives while the review is open: the review keeps what was reviewed.
    await settle(15_000);
    expect(mocks.fetchPoolQuote).toHaveBeenCalledTimes(2);
    expect(within(review).getByText(tokens("990000000000000000000000"))).toBeVisible();
    fireEvent.click(within(review).getByRole("button", { name: "Buy $TTONE" }));
    await settle(0);
    expect(mocks.buildPoolTrade).toHaveBeenCalledWith(expect.objectContaining({ amount: "50000000000000", minOut: "990000000000000000000000" }));
    // The server says the pool moved past it: now the review shows the fresher quote, and says so.
    expect(within(review).getByText(en.mission.trade.moved)).toBeVisible();
    expect(within(review).getByText(tokens("891000000000000000000000"))).toBeVisible();
  });
});
