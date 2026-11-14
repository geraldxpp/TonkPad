import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { TonkApiError } from "@/shared/tonk/api";
import { formatTokensFull } from "@/shared/tonk/format";
import { quoteTrade } from "@/shared/tonk/quote";
import type { MissionJson, TradeBuild, TxEventJson } from "@/shared/tonk/mission";
import { TONK_TESTNET } from "@/shared/tonk/networks";
import type { TonkSettingsJson, UnsignedTx } from "@/shared/tonk/types";
import { WalletActionError } from "@/shared/wallet/types";
import { ActionNote } from "../components/curve/ActionNote";
import { CreatorPanel } from "../components/curve/CreatorPanel";
import { CurveStatus } from "../components/curve/CurveStatus";
import { CurveTradePanel, type CurveTradePanelProps } from "../components/curve/CurveTradePanel";
import { RewardsCard } from "../components/curve/RewardsCard";
import { UnpaidEth } from "../components/curve/UnpaidEth";
import type { ActionState } from "../hooks/useAction";
import type { SentTrade } from "../hooks/useSentTrade";
import { BUYER, CREATOR, DAY, LAUNCHED, mission, TOKEN, view } from "./mission.fixture";

const mocks = vi.hoisted(() => ({
  wallet: { connect: vi.fn(async () => true), sendEvmTransaction: vi.fn(async (sent: { to: string }): Promise<string> => `0x${"ab".repeat(32)}${sent.to.slice(0, 0)}`) },
  buildTrade: vi.fn(),
  fetchSettings: vi.fn(),
  fetchLaunchStatus: vi.fn(),
}));

vi.mock("@/shared/wallet/wallet", () => ({ wallet: mocks.wallet, useWallet: () => ({ accounts: {} }) }));
vi.mock("@/shared/tonk/api", async (actual) => ({
  ...(await actual<typeof import("@/shared/tonk/api")>()),
  buildTrade: mocks.buildTrade,
  fetchSettings: mocks.fetchSettings,
  fetchLaunchStatus: mocks.fetchLaunchStatus,
}));

const SETTINGS: TonkSettingsJson = { chainId: 46630, launchFee: "100000000000000", virtualEth: "1500000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "10000000", readAt: 1 };
const HASH = `0x${"ab".repeat(32)}`;
const tx = (to: string): UnsignedTx => ({ to, data: "0x", value: "0", gas: "100000" });
const IDLE: ActionState = { step: "idle", kind: null, error: null, hash: null, events: [], stalled: false };
const tr = en.token.trade;
const m = en.mission;

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
  // Reset, not just cleared: an answer one test queued must never reach the next.
  mocks.buildTrade.mockReset();
  mocks.wallet.sendEvmTransaction.mockReset().mockResolvedValue(HASH);
  mocks.fetchSettings.mockReset().mockResolvedValue(SETTINGS);
  mocks.fetchLaunchStatus.mockReset().mockResolvedValue({ state: "confirmed", mission: null, events: [] });
  window.localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

const handlers = { onSent: vi.fn(), onDismiss: vi.fn(), onMission: vi.fn() };
function panel(props: Partial<CurveTradePanelProps> = {}) {
  render(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={null} {...handlers} {...props} />);
  return screen.getByRole("region", { name: tr.label });
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const cta = (name: string) => screen.getByRole("button", { name });

describe("the curve trade panel", () => {
  it("quotes a buy from the curve as you type, with the contract's fees, and asks for a wallet first", () => {
    const card = panel({ view: view(null) });
    type(tr.pay, "0.00005");
    // The prompt's check value: 0.00005 test ETH buys 26,119,201.14 tokens at this state.
    expect(within(card).getByText("26.12M")).toBeVisible();
    expect(within(card).getByText("Min. 25.86M TTONE at 1% slippage")).toBeVisible();
    expect(within(card).getByText("1% protocol · 2% Crew · 1% Creator")).toBeVisible();
    expect(within(card).getByText("Balance —")).toBeVisible();
    fireEvent.click(cta(en.header.connectWallet));
    expect(mocks.wallet.connect).toHaveBeenCalledWith("rh");
  });

  it("charges no Crew fee while nobody eligible holds the token, and says so", () => {
    const card = panel({ mission: mission({ eligibleSupply: "0" }) });
    type(tr.pay, "0.00005");
    expect(within(card).getByText("1% protocol · 1% Creator · no Crew fee until someone eligible holds the token")).toBeVisible();
    // 2% more of the amount reaches the curve, so it buys more than 26.12M.
    expect(within(card).getByText("26.65M")).toBeVisible();
  });

  it("says how much of the supply eligible holders must own before the Crew fee starts, on builds with the floor", () => {
    const card = panel({ mission: mission({ eligibleSupply: "5000000000000000000000000", crewFloor: "10000000000000000000000000" }) });
    expect(within(card).getByText("1% protocol · 1% Creator · no Crew fee until eligible holders own 1% of the supply")).toBeVisible();
  });

  it("offers the launchpad's presets, and a Max that keeps back the network fee", async () => {
    panel();
    expect(await screen.findByRole("button", { name: "0.000025" })).toBeVisible();
    expect([cta("0.00006"), cta("0.00015")].every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
    fireEvent.click(cta(tr.max));
    // 0.01 test ETH less 700,000 gas at the chain's price.
    expect(screen.getByLabelText(tr.pay)).toHaveValue("0.009993");
    fireEvent.click(cta("0.00015"));
    expect(screen.getByLabelText(tr.pay)).toHaveValue("0.00015");
  });

  it.each([
    ["a graduated token", { mission: mission({ graduated: true }) }, m.trade.graduated],
    ["a paused launchpad", { mission: mission({ paused: true }) }, m.trade.paused],
    ["the launch-block wait", { mission: mission({ buyingOpen: false }) }, m.trade.early],
    ["no amount", {}, tr.enter],
  ] as [string, Partial<CurveTradePanelProps>, string][])("says what stops a trade: %s", (_, props, label) => {
    panel(props);
    if (label !== tr.enter) type(tr.pay, "0.00005");
    expect(cta(label)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cta(label));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("while paused, keeps selling open where the contract still takes sells, and says buying is paused (patch A)", () => {
    panel({ mission: mission({ paused: true, sellingOpen: true }), view: view({ tokens: "5000000000000000000000000" }) });
    type(tr.pay, "0.00005");
    expect(cta(m.trade.buyPaused)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "1000");
    expect(cta(m.trade.reviewSell)).not.toHaveAttribute("aria-disabled");
  });

  it("says when the wallet is short, with the faucet for test ETH and the balance for tokens", () => {
    panel();
    type(tr.pay, "0.5");
    expect(cta("Not enough test ETH")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: en.launch.action.faucet })).toHaveAttribute("href", TONK_TESTNET.faucetUrl);
    // Selling is typed in tokens, and isn't held up by the launch-block wait.
    fireEvent.click(cta(tr.sell));
    expect(screen.getByText("Balance 0 TTONE")).toBeVisible();
    type(tr.sellAmount, "1000000");
    expect(cta("Not enough $TTONE")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: en.launch.action.faucet })).not.toBeInTheDocument();
  });

  it("reviews a buy, has the server check it, and hands the wallet's hash to the page", async () => {
    const newer = mission({ block: 151_327_099 });
    const quote = { side: "buy", amountIn: "50000000000000", out: "26119201142461485199930760", minOut: "25858009131036870347931452", protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000", refund: "0", completesCurve: false, capped: false } as const;
    mocks.buildTrade.mockResolvedValue({ step: "trade", tx: tx(TONK_TESTNET.launchpad), quote, mission: newer } satisfies TradeBuild);
    panel();
    type(tr.pay, "0.00005");
    fireEvent.click(cta(m.trade.reviewBuy));
    const review = screen.getByRole("dialog", { name: en.swap.reviewTitle });
    expect(within(review).getByText("0.00005 test ETH")).toBeVisible();
    expect(within(review).getByText("26,119,201.14 $TTONE")).toBeVisible();
    expect(within(review).getByText("25,858,009.13 $TTONE")).toBeVisible();
    // 1% protocol and 1% Creator, and 2% Crew between them.
    expect(within(review).getAllByText("0.0000005 test ETH")).toHaveLength(2);
    expect(within(review).getByText("0.000001 test ETH")).toBeVisible();
    fireEvent.click(within(review).getByRole("button", { name: "Buy $TTONE" }));
    await waitFor(() => expect(handlers.onSent).toHaveBeenCalledWith(HASH));
    expect(mocks.buildTrade).toHaveBeenCalledWith({ token: TOKEN, trader: BUYER, side: "buy", amount: "50000000000000", minOut: "25858009131036870347931452", referrer: null });
    expect(mocks.wallet.sendEvmTransaction).toHaveBeenCalledWith(tx(TONK_TESTNET.launchpad));
    expect(handlers.onMission).toHaveBeenCalledWith(newer);
    expect(screen.getByLabelText(tr.pay)).toHaveValue("");
  });

  it("names a remembered referrer in the review and sends it, unless it is the trader", async () => {
    const referrer = "0x4444444444444444444444444444444444444444";
    window.localStorage.setItem(`tonkpad-ref:${TONK_TESTNET.chainId}`, referrer);
    mocks.buildTrade.mockResolvedValue({ step: "moved", mission: mission() } satisfies TradeBuild);
    panel();
    type(tr.pay, "0.00005");
    fireEvent.click(cta(m.trade.reviewBuy));
    expect(screen.getByText("25% of the protocol fee goes to 0x4444…4444")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Buy $TTONE" }));
    await waitFor(() => expect(mocks.buildTrade).toHaveBeenCalledWith(expect.objectContaining({ referrer })));
  });

  it("sells in two steps when the launchpad may not yet take the tokens: an exact approval, then the sale", async () => {
    const sale = { side: "sell", amountIn: "1000000000000000000000000", out: "1713856886439", minOut: "1696718317574", protocolFee: "17852675900", crewFee: "35705351800", creatorFee: "17852675900", refund: "0", completesCurve: false, capped: false } as const;
    mocks.buildTrade.mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild).mockResolvedValueOnce({ step: "trade", tx: tx(TONK_TESTNET.launchpad), quote: sale, mission: mission() } satisfies TradeBuild);
    mocks.wallet.sendEvmTransaction.mockResolvedValueOnce(`0x${"a1".repeat(32)}`).mockResolvedValueOnce(HASH);
    panel({ view: view({ owner: CREATOR, tokens: "24800471698113207547169812" }) });
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "1000000");
    // The prompt's check value: 1,000,000 tokens sell for 0.000001713856886439 test ETH net.
    expect(screen.getByText("0.000001714")).toBeVisible();
    fireEvent.click(cta(m.trade.reviewSell));
    expect(screen.getByText("Two steps: approve exactly 1,000,000 $TTONE, then sell.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sell $TTONE" }));
    await waitFor(() => expect(handlers.onSent).toHaveBeenCalledWith(HASH));
    expect(mocks.wallet.sendEvmTransaction.mock.calls.map(([sent]) => sent.to)).toEqual([TOKEN, TONK_TESTNET.launchpad]);
    // The approval is watched to its receipt before the sale is built again.
    expect(mocks.fetchLaunchStatus).toHaveBeenCalledWith(`0x${"a1".repeat(32)}`, null);
    expect(mocks.buildTrade).toHaveBeenCalledTimes(2);
    // The sale is built no earlier than the confirmed approval: the server is told which one it was.
    expect(mocks.buildTrade.mock.calls[0][0]).not.toHaveProperty("approval");
    expect(mocks.buildTrade.mock.calls[1][0]).toMatchObject({ side: "sell", approval: `0x${"a1".repeat(32)}` });
  });

  it("says the approval went through when the sale isn't sent after it, and keeps the approval's link", async () => {
    const approval = `0x${"a1".repeat(32)}`;
    mocks.buildTrade.mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild).mockRejectedValueOnce(new TonkApiError("unavailable"));
    mocks.wallet.sendEvmTransaction.mockResolvedValueOnce(approval);
    panel({ view: view({ owner: CREATOR, tokens: "24800471698113207547169812" }) });
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "1000000");
    fireEvent.click(cta(m.trade.reviewSell));
    fireEvent.click(screen.getByRole("button", { name: "Sell $TTONE" }));
    const alert = await screen.findByText(m.trade.errors.approvedNotSent);
    expect(alert.closest("[role=alert]")).toHaveTextContent(m.trade.failedTitle);
    expect(mocks.wallet.sendEvmTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("link", { name: en.swap.viewTx }).map((link) => link.getAttribute("href"))).toContain(`${TONK_TESTNET.explorerUrl}/tx/${approval}`);
    expect(handlers.onSent).not.toHaveBeenCalled();
  });

  it("stops without a second approval when the launchpad still can't take the tokens after the first", async () => {
    const approval = `0x${"a1".repeat(32)}`;
    mocks.buildTrade.mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild).mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild);
    mocks.wallet.sendEvmTransaction.mockResolvedValueOnce(approval);
    panel({ view: view({ owner: CREATOR, tokens: "24800471698113207547169812" }) });
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "1000000");
    fireEvent.click(cta(m.trade.reviewSell));
    fireEvent.click(screen.getByRole("button", { name: "Sell $TTONE" }));
    expect(await screen.findByText(m.trade.errors.approvedNotSent)).toBeVisible();
    expect(mocks.wallet.sendEvmTransaction).toHaveBeenCalledTimes(1);
    expect(handlers.onSent).not.toHaveBeenCalled();
  });

  it("follows a sped-up approval to the sale, and stops at a replacement that approved something else", async () => {
    const approval = `0x${"a1".repeat(32)}`;
    const faster = `0x${"a2".repeat(32)}`;
    const sale = { side: "sell", amountIn: "1000000000000000000000000", out: "1713856886439", minOut: "1696718317574", protocolFee: "17852675900", crewFee: "35705351800", creatorFee: "17852675900", refund: "0", completesCurve: false, capped: false } as const;
    const settle = (call: { to: string; data: string; value: string }) => mocks.fetchLaunchStatus.mockResolvedValue({ state: "confirmed", mission: null, events: [], block: 1, sender: null, replacedBy: faster, replacedCall: call });
    mocks.buildTrade.mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild).mockResolvedValueOnce({ step: "trade", tx: tx(TONK_TESTNET.launchpad), quote: sale, mission: mission() } satisfies TradeBuild);
    mocks.wallet.sendEvmTransaction.mockResolvedValueOnce(approval).mockResolvedValueOnce(HASH);
    settle({ to: TOKEN, data: "0x", value: "0" });
    panel({ view: view({ owner: CREATOR, tokens: "24800471698113207547169812" }) });
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "1000000");
    fireEvent.click(cta(m.trade.reviewSell));
    fireEvent.click(screen.getByRole("button", { name: "Sell $TTONE" }));
    await waitFor(() => expect(handlers.onSent).toHaveBeenCalledWith(HASH));
    // The sale is built after the approval that landed: the sped-up one.
    expect(mocks.buildTrade.mock.calls[1][0]).toMatchObject({ approval: faster });
    // Replaced by a call to something else: nothing more is sent.
    mocks.buildTrade.mockReset().mockResolvedValueOnce({ step: "approve", tx: tx(TOKEN), mission: mission() } satisfies TradeBuild);
    mocks.wallet.sendEvmTransaction.mockReset().mockResolvedValueOnce(approval);
    settle({ to: CREATOR, data: "0x", value: "0" });
    // The sale went through, so the review closed and the amount cleared: a fresh review.
    type(tr.sellAmount, "1000000");
    fireEvent.click(cta(m.trade.reviewSell));
    fireEvent.click(screen.getByRole("button", { name: "Sell $TTONE" }));
    expect(await screen.findByText(m.trade.errors.replaced)).toBeVisible();
    expect(mocks.wallet.sendEvmTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.buildTrade).toHaveBeenCalledTimes(1);
  });

  it("quotes the last eligible holder's full sale without the Crew fee, as the contract charges it", () => {
    const held = "24800471698113207547169812";
    panel({ mission: mission({ eligibleSupply: held }), view: view({ owner: CREATOR, tokens: held }) });
    fireEvent.click(cta(tr.sell));
    type(tr.sellAmount, "24800471.698113207547169812");
    fireEvent.click(cta(m.trade.reviewSell));
    expect(screen.getByText(`${en.launch.economics.crewTitle} · 0%`)).toBeVisible();
    // Half of it leaves an eligible holder: the Crew fee stays.
    fireEvent.click(screen.getAllByRole("button", { name: en.prefs.close })[0]);
    type(tr.sellAmount, "12400235");
    fireEvent.click(cta(m.trade.reviewSell));
    expect(screen.getByText(`${en.launch.economics.crewTitle} · 2%`)).toBeVisible();
  });

  it("keeps the review open with the new figures when the price moved, and sends nothing", async () => {
    const moved = mission({ virtualEth: "1796000000000000", block: 151_327_100 });
    mocks.buildTrade.mockResolvedValue({ step: "moved", mission: moved } satisfies TradeBuild);
    panel();
    type(tr.pay, "0.00005");
    fireEvent.click(cta(m.trade.reviewBuy));
    fireEvent.click(screen.getByRole("button", { name: "Buy $TTONE" }));
    expect(await screen.findByText(m.trade.moved)).toBeVisible();
    expect(handlers.onMission).toHaveBeenCalledWith(moved);
    expect(mocks.wallet.sendEvmTransaction).not.toHaveBeenCalled();
    expect(handlers.onSent).not.toHaveBeenCalled();
  });

  it("sends the minimum it reviewed: a refresh never changes the review unseen, only the server's moved does (campaign round 1)", async () => {
    // A competing buy lands while the review is open, and the page's 5-second refresh carries it in.
    const refreshed = mission({ virtualEth: "1796000000000000", block: 151_327_100 });
    mocks.buildTrade
      .mockResolvedValueOnce({ step: "moved", mission: refreshed } satisfies TradeBuild)
      .mockResolvedValueOnce({ step: "trade", tx: tx(TONK_TESTNET.launchpad), quote: {} as never, mission: refreshed } satisfies TradeBuild);
    const { rerender } = render(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={null} {...handlers} />);
    type(tr.pay, "0.00005");
    fireEvent.click(cta(m.trade.reviewBuy));
    const review = screen.getByRole("dialog", { name: en.swap.reviewTitle });
    rerender(<CurveTradePanel mission={refreshed} network={TONK_TESTNET} view={view()} sent={null} {...handlers} />);
    expect(within(review).getByText("25,858,009.13 $TTONE")).toBeVisible();
    fireEvent.click(within(review).getByRole("button", { name: "Buy $TTONE" }));
    await waitFor(() => expect(mocks.buildTrade).toHaveBeenCalledWith(expect.objectContaining({ minOut: "25858009131036870347931452" })));
    // The server says it moved past that minimum: the review shows the newer figures with the notice, and the next go sends them.
    expect(await within(review).findByText(m.trade.moved)).toBeVisible();
    const next = quoteTrade(refreshed, "buy", BigInt("50000000000000"), 100, { sellerEligible: true });
    expect(within(review).getByText(`${formatTokensFull(BigInt(next.minOut))} $TTONE`)).toBeVisible();
    fireEvent.click(within(review).getByRole("button", { name: "Buy $TTONE" }));
    await waitFor(() => expect(handlers.onSent).toHaveBeenCalledWith(HASH));
    expect(mocks.buildTrade).toHaveBeenLastCalledWith(expect.objectContaining({ minOut: next.minOut }));
  });

  it("says why it stopped when the wallet says no, and offers another go", async () => {
    mocks.buildTrade.mockResolvedValue({ step: "trade", tx: tx(TONK_TESTNET.launchpad), quote: {} as never, mission: mission() });
    mocks.wallet.sendEvmTransaction.mockRejectedValueOnce(new WalletActionError("rejected"));
    panel();
    type(tr.pay, "0.00005");
    fireEvent.click(cta(m.trade.reviewBuy));
    fireEvent.click(screen.getByRole("button", { name: "Buy $TTONE" }));
    const alert = await screen.findByText(en.swap.errors.rejected);
    expect(alert.closest("[role=alert]")).toHaveTextContent(m.trade.failedTitle);
    expect(screen.getByRole("button", { name: en.swap.tryAgain })).toBeEnabled();
    expect(handlers.onSent).not.toHaveBeenCalled();
  });

  it("shows a sent trade confirming, then what the chain recorded, and holds the next trade until it settles", () => {
    const bought: TxEventJson = { kind: "trade", token: TOKEN, trader: BUYER, side: "buy", eth: "50000000000000", tokens: "26119201142461485199930760", protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000" };
    const sent = (state: SentTrade["tx"]["state"], events: TxEventJson[] = []): SentTrade => ({ hash: HASH, tx: { state, mission: null, events, unreachable: false, stalled: false, replacedBy: null, notSent: false }, waiting: state === "pending" });
    const { rerender } = render(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={sent("pending")} {...handlers} />);
    expect(screen.getByText("Confirming on Robinhood Chain Testnet…")).toBeVisible();
    type(tr.pay, "0.00005");
    expect(cta(m.trade.reviewBuy)).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: en.swap.done })).not.toBeInTheDocument();

    rerender(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={sent("confirmed", [bought])} {...handlers} />);
    expect(screen.getByText("Bought 26.12M $TTONE")).toBeVisible();
    expect(screen.getByRole("link", { name: en.swap.viewTx })).toHaveAttribute("href", `${TONK_TESTNET.explorerUrl}/tx/${HASH}`);
    expect(cta(m.trade.reviewBuy)).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByRole("button", { name: en.swap.done }));
    expect(handlers.onDismiss).toHaveBeenCalled();

    rerender(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={sent("failed")} {...handlers} />);
    expect(screen.getByText(m.trade.errors.reverted)).toBeVisible();
    // A confirmed transaction that traded nothing is never shown as a trade.
    rerender(<CurveTradePanel mission={mission()} network={TONK_TESTNET} view={view()} sent={sent("confirmed")} {...handlers} />);
    expect(screen.getByText(m.trade.errors.other)).toBeVisible();
  });
});

describe("the creator's tools", () => {
  const onAction = vi.fn();
  const tools = (patch: Partial<MissionJson> = {}, action: ActionState = IDLE) =>
    render(<CreatorPanel mission={mission({ readAt: (LAUNCHED + DAY) * 1000, ...patch })} network={TONK_TESTNET} owner={CREATOR} action={action} onAction={onAction} />);
  // The panel's own figures come first; the Extend sheet repeats the lock's end.
  const figure = (label: string) => screen.getAllByText(label, { selector: "dt" })[0].nextElementSibling;

  it("shows what is locked, unlocked and claimed, and claims what has unlocked", () => {
    tools();
    // One day into a 180-day vest of 99,201,886.79 tokens: 551,121.59 have unlocked.
    expect(figure(m.facts.locked)).toHaveTextContent("98.65M TTONE");
    expect(figure(m.facts.claimable)).toHaveTextContent("551.12K TTONE");
    expect(figure(m.facts.claimed)).toHaveTextContent("0 TTONE");
    expect(figure(m.facts.ends)).toHaveTextContent("May 9, 2027");
    fireEvent.click(screen.getByRole("button", { name: "Claim 551.12K $TTONE" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "claim", token: TOKEN, owner: CREATOR });
  });

  it("has nothing to claim on a time-lock until its end, and says why", () => {
    tools({ lock: { type: "time", lockedBps: 8000, start: LAUNCHED, end: LAUNCHED + 180 * DAY, total: "99201886792452830188679245", claimed: "0", checkpoint: "0" } });
    expect(screen.getByRole("button", { name: m.creator.nothing })).toBeDisabled();
    expect(screen.getByText(m.creator.timeLockNote)).toBeVisible();
  });

  it("offers only Edit details on a token with no lock", () => {
    tools({ lock: null });
    expect(screen.getByText(m.creator.noLock)).toBeVisible();
    expect(screen.queryByRole("button", { name: m.creator.extend })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.creator.edit })).toBeEnabled();
  });

  it("extends the lock by 7 days or more, showing the new end and that a vest starts again", () => {
    tools();
    fireEvent.click(screen.getByRole("button", { name: m.creator.extend }));
    const sheet = screen.getByRole("dialog", { name: m.creator.extendTitle });
    expect(within(sheet).getByText(m.creator.extendSub)).toBeVisible();
    expect(within(sheet).getByText(m.creator.extendVestNote)).toBeVisible();
    // 30 days by default: 9 May 2027 becomes 8 June 2027.
    expect(within(sheet).getByText("Jun 8, 2027")).toBeVisible();
    fireEvent.click(within(sheet).getByRole("button", { name: "+7 days" }));
    expect(within(sheet).getByText("May 16, 2027")).toBeVisible();
    const days = within(sheet).getByRole("textbox", { name: m.creator.extendDays });
    fireEvent.change(days, { target: { value: "6" } });
    expect(within(sheet).getByRole("button", { name: "Extend by 7 days" })).toBeDisabled();
    expect(days).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(days, { target: { value: "7" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Extend by 7 days" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "extend", token: TOKEN, owner: CREATOR, days: 7 });
  });

  it("edits the details starting from what is on-chain, with the Creator Studio's checks", () => {
    tools({ metadata: '{"v":1,"description":"First test launch.","x":"tonkfun"}' });
    fireEvent.click(screen.getByRole("button", { name: m.creator.edit }));
    const sheet = screen.getByRole("dialog", { name: m.creator.editTitle });
    const field = (label: string) => within(sheet).getByLabelText(label);
    expect(field(en.launch.basics.description)).toHaveValue("First test launch.");
    expect(field(en.launch.basics.x)).toHaveValue("tonkfun");
    fireEvent.change(field(en.launch.basics.website), { target: { value: "javascript:alert(1)" } });
    expect(within(sheet).getByText(en.launch.errors.website)).toBeVisible();
    expect(within(sheet).getByRole("button", { name: m.creator.save })).toBeDisabled();
    fireEvent.change(field(en.launch.basics.website), { target: { value: "tonkfun.fun" } });
    fireEvent.change(field(en.launch.basics.description), { target: { value: " New words. " } });
    fireEvent.click(within(sheet).getByRole("button", { name: m.creator.save }));
    expect(onAction).toHaveBeenCalledWith({ kind: "edit", token: TOKEN, owner: CREATOR, description: "New words.", x: "tonkfun", telegram: "", website: "tonkfun.fun", image: "", agent: null });
  });

  it("reports each action from its confirmed receipt, and holds the buttons while one is in flight", () => {
    const { rerender } = tools({}, { step: "confirming", kind: "claim", error: null, hash: `0x${"cd".repeat(32)}`, events: [], stalled: false });
    expect(screen.getByText(m.action.confirming)).toBeVisible();
    expect([m.creator.extend, m.creator.edit].map((name) => screen.getByRole("button", { name }).hasAttribute("disabled"))).toEqual([true, true]);
    const show = (action: ActionState) => rerender(<CreatorPanel mission={mission()} network={TONK_TESTNET} owner={CREATOR} action={action} onAction={onAction} />);
    show({ step: "done", kind: "claim", error: null, hash: HASH, stalled: false, events: [{ kind: "claimed", token: TOKEN, amount: "551121593291404612159329" }] });
    expect(screen.getByText("Claimed 551.12K $TTONE")).toBeVisible();
    show({ step: "done", kind: "extend", error: null, hash: HASH, stalled: false, events: [{ kind: "extended", token: TOKEN, lockEnd: LAUNCHED + 187 * DAY }] });
    expect(screen.getByText("Lock extended to May 16, 2027")).toBeVisible();
    // Another token's extension is never told as this one's.
    show({ step: "done", kind: "extend", error: null, hash: HASH, stalled: false, events: [{ kind: "extended", token: BUYER, lockEnd: LAUNCHED + 187 * DAY }] });
    expect(screen.getByText(m.trade.errors.other)).toBeVisible();
    show({ step: "failed", kind: "claim", error: "rejected", hash: null, events: [], stalled: false });
    expect(screen.getByRole("alert")).toHaveTextContent(`${m.trade.failedTitle}${en.swap.errors.rejected}`);
  });
});

describe("a transaction that takes long, or that the wallet replaced", () => {
  const OTHER = `0x${"99".repeat(32)}`;
  const card = (tx: Partial<SentTrade["tx"]>, onDismiss = vi.fn()) => {
    const full: SentTrade["tx"] = { state: "unknown", mission: null, events: [], unreachable: false, stalled: false, replacedBy: null, notSent: false, ...tx };
    const waiting = full.state !== "confirmed" && full.state !== "failed" && full.state !== "replaced";
    return render(<CurveStatus sent={{ hash: HASH, tx: full, waiting }} token={TOKEN} ticker="TTONE" network={TONK_TESTNET} onDismiss={onDismiss} />);
  };

  it("says a slow trade is still confirming, never that it failed, and lets you stop watching", () => {
    const onDismiss = vi.fn();
    card({ state: "unknown", stalled: true }, onDismiss);
    expect(screen.getByText(m.trade.stalledTitle)).toBeVisible();
    expect(screen.getByText(m.trade.stalled)).toBeVisible();
    expect(screen.queryByText(m.trade.failedTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(m.trade.errors.replaced)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.trade.stopWatching }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("says a trade the chain hasn't seen isn't on the chain yet, warns not to send it twice, drops the dead explorer link, and lets you close it", () => {
    const onDismiss = vi.fn();
    card({ state: "unknown", notSent: true }, onDismiss);
    expect(screen.getByText(m.trade.notSentTitle)).toBeVisible();
    expect(screen.getByText(m.trade.notSent)).toBeVisible();
    expect(screen.queryByText(m.trade.failedTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.swap.viewTx })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.trade.stopWatching }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows what the wallet sent in a trade's place, with its own link: a speed-up as the trade, a cancellation as replaced", () => {
    const bought: TxEventJson = { kind: "trade", token: TOKEN, trader: BUYER, side: "buy", eth: "50000000000000", tokens: "26119201142461485199930760", protocolFee: "500000000000", crewFee: "1000000000000", creatorFee: "500000000000" };
    const { unmount } = card({ state: "confirmed", events: [bought], replacedBy: OTHER });
    expect(screen.getByText("Bought 26.12M $TTONE")).toBeVisible();
    expect(screen.getByRole("link", { name: en.swap.viewTx })).toHaveAttribute("href", `${TONK_TESTNET.explorerUrl}/tx/${OTHER}`);
    unmount();
    card({ state: "confirmed", events: [], replacedBy: OTHER });
    expect(screen.getByText(m.trade.failedTitle)).toBeVisible();
    expect(screen.getByText(m.trade.errors.replaced)).toBeVisible();
  });

  it("says a slow action is still confirming and offers to stop watching, without calling it failed", () => {
    const onStop = vi.fn();
    render(<ActionNote state={{ step: "confirming", kind: "extend", error: null, hash: HASH, events: [], stalled: true }} network={TONK_TESTNET} done="" onStop={onStop} />);
    expect(screen.getByRole("status")).toHaveTextContent(`${m.trade.stalledTitle}${m.trade.stalled}`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.trade.stopWatching }));
    expect(onStop).toHaveBeenCalled();
  });
});

describe("Crew Rewards and unpaid ETH", () => {
  const onAction = vi.fn();

  it("shows what holders were paid, and asks for a wallet before anything of yours", () => {
    render(<RewardsCard mission={mission({ crewPaid: "3000000000000" })} network={TONK_TESTNET} view={view(null)} action={IDLE} onAction={onAction} />);
    expect(screen.getByText("2% of every curve trade, shared by holders")).toBeVisible();
    expect(screen.getByText("0.000003 test ETH")).toBeVisible();
    expect(screen.getByText(m.rewards.connect)).toBeVisible();
    expect(screen.queryByText(m.rewards.yours)).not.toBeInTheDocument();
  });

  it("claims a holder's unpaid rewards, and says when there are none", () => {
    const { rerender } = render(<RewardsCard mission={mission()} network={TONK_TESTNET} view={view({ unpaidRewards: "1000000000000" })} action={IDLE} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim 0.000001 test ETH" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "rewards", token: TOKEN, owner: BUYER });
    rerender(<RewardsCard mission={mission()} network={TONK_TESTNET} view={view()} action={IDLE} onAction={onAction} />);
    expect(screen.getByText(m.rewards.none)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<RewardsCard mission={mission()} network={TONK_TESTNET} view={view()} action={{ step: "done", kind: "rewards", error: null, hash: HASH, stalled: false, events: [{ kind: "rewards", token: TOKEN, holder: BUYER, amount: "1000000000000" }] }} onAction={onAction} />);
    expect(screen.getByText("Claimed 0.000001 test ETH")).toBeVisible();
  });

  it("offers a withdrawal only when the launchpad is holding ETH for the wallet", () => {
    const { container, rerender } = render(<UnpaidEth amount={BigInt(0)} owner={BUYER} network={TONK_TESTNET} action={IDLE} onAction={onAction} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<UnpaidEth amount={BigInt("5000000000000")} owner={BUYER} network={TONK_TESTNET} action={IDLE} onAction={onAction} />);
    expect(screen.getByText("The launchpad couldn't deliver 0.000005 test ETH to this wallet.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: m.unpaid.withdraw }));
    expect(onAction).toHaveBeenCalledWith({ kind: "withdraw", owner: BUYER });
    rerender(<UnpaidEth amount={BigInt(0)} owner={BUYER} network={TONK_TESTNET} action={{ step: "done", kind: "withdraw", error: null, hash: HASH, stalled: false, events: [{ kind: "withdrawn", recipient: BUYER, amount: "5000000000000" }] }} onAction={onAction} />);
    expect(screen.getByText("Withdrew 0.000005 test ETH")).toBeVisible();
  });
});
