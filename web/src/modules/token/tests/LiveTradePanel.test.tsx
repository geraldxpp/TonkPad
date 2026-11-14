import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwapQuote } from "@/shared/types/swap";
import type { WalletBalancesView } from "@/shared/wallet/useWalletBalances";
import type { WalletView } from "@/shared/wallet/wallet";
import { LiveTradePanel } from "../components/trade/LiveTradePanel";
import type { TradeToken } from "../components/trade/types";

const OWNER = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const MINT = "So11111111111111111111111111111111111111112";

const mocks = vi.hoisted(() => ({
  view: null as WalletView | null,
  funds: null as WalletBalancesView | null,
  wallet: { connect: vi.fn(async () => true) },
  /** The swap engine's answer: closed by default, as before go-live. */
  live: { quote: null as SwapQuote | null, loading: false, error: "unavailable" as string | null, tradingOpen: false as boolean | null },
}));

vi.mock("@/shared/wallet/wallet", () => ({ useWallet: () => mocks.view, wallet: mocks.wallet }));
vi.mock("@/shared/wallet/useWalletBalances", () => ({ useWalletBalances: () => mocks.funds }));
vi.mock("../hooks/useLiveTrade", () => ({
  useLiveTrade: () => ({ request: null, live: { ...mocks.live, refresh: () => undefined }, from: null, to: null, slippageBps: 100 }),
}));

const token: TradeToken = {
  address: MINT,
  name: "Live Solana",
  ticker: "LVS",
  art: "/tokens/ghosty.png",
  chain: "sol",
  launchpad: "pump",
  onCurve: true,
  priceUsd: 0.0000621,
  nativeUsd: 100,
  feePct: null,
  crewPct: null,
};

const idle: WalletView = { phase: "idle", pending: false, chain: null, address: null, accounts: {}, evmWallet: null };
const noFunds: WalletBalancesView = { owner: null, balances: null, loading: false, failed: false };
const funded: WalletBalancesView = {
  owner: OWNER,
  balances: {
    chain: "sol",
    owner: OWNER,
    native: { raw: "1500000000", decimals: 9 },
    token: { address: MINT, amount: { raw: "2500000000000", decimals: 6 } },
    readAt: 1,
  },
  loading: false,
  failed: false,
};

const panel = () => screen.getByRole("region", { name: "Trade" });

beforeEach(() => {
  mocks.view = idle;
  mocks.funds = noFunds;
  mocks.live = { quote: null, loading: false, error: "unavailable", tradingOpen: false };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LiveTradePanel", () => {
  it("asks for a wallet on the token's chain while none is connected", () => {
    render(<LiveTradePanel token={token} />);
    expect(screen.getByText("Balance —")).toBeInTheDocument();
    const connect = screen.getByRole("button", { name: "Connect wallet" });
    expect(connect).toHaveAccessibleDescription("Connecting shares only your address. Nothing is signed.");
    fireEvent.click(connect);
    expect(mocks.wallet.connect).toHaveBeenCalledWith("sol");
  });

  it("asks for a wallet on this chain too when one is connected on the other chain", () => {
    mocks.view = { phase: "ready", pending: false, chain: "rh", address: "0x7a5e00000000000000000000000000000000c0de", accounts: { rh: "0x7a5e00000000000000000000000000000000c0de" }, evmWallet: null };
    render(<LiveTradePanel token={token} />);
    const button = screen.getByRole("button", { name: "Connect a Solana wallet" });
    expect(button).toHaveAccessibleDescription("Connecting shares only your address. Nothing is signed.");
    fireEvent.click(button);
    expect(mocks.wallet.connect).toHaveBeenCalledWith("sol");
  });

  it("shows the real balances and keeps the trade button disabled", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER }, evmWallet: null };
    mocks.funds = funded;
    render(<LiveTradePanel token={token} />);
    expect(screen.getByText("Balance 1.5 SOL on Solana")).toBeInTheDocument();
    const trade = screen.getByRole("button", { name: "Buy $LVS · 0.05 SOL" });
    expect(trade).toHaveAttribute("aria-disabled", "true");
    expect(trade).toHaveAccessibleDescription("Trading opens soon: nothing can be signed or sent yet.");
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByLabelText("You pay")).toHaveValue(1.5);

    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByText("Balance 2.50M LVS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByLabelText("You sell")).toHaveValue(2.5);
    fireEvent.change(screen.getByLabelText("You sell"), { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Not enough $LVS" })).toHaveAttribute("aria-disabled", "true");
    expect(panel()).not.toHaveTextContent("Need funds");
  });

  it("enables the trade once trading is open and a quote is in, using the quote's amounts", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER }, evmWallet: null };
    mocks.funds = funded;
    mocks.live = {
      quote: {
        chain: "sol", provider: "jupiter", inToken: MINT, outToken: "LVS", inAmount: "50000000", outAmount: "800000000000", minOut: "792000000000",
        slippageBps: 100, priceImpact: 0, fee: null, networkFee: "5000", inUsd: 5, outUsd: 4.95, route: ["Pump.fun"], tradingOpen: true, quotedAt: 1,
      },
      loading: false,
      error: null,
      tradingOpen: true,
    };
    render(<LiveTradePanel token={token} />);
    const trade = screen.getByRole("button", { name: "Buy $LVS · 0.05 SOL" });
    expect(trade).not.toHaveAttribute("aria-disabled");
    expect(trade).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByText("Slippage")).toBeInTheDocument();
    expect(panel()).toHaveTextContent("1%");
  });

  it("says why a quote is missing once trading is open", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER }, evmWallet: null };
    mocks.funds = funded;
    mocks.live = { quote: null, loading: false, error: "no-route", tradingOpen: true };
    render(<LiveTradePanel token={token} />);
    expect(screen.getByRole("button", { name: "Buy $LVS · 0.05 SOL" })).toHaveAccessibleDescription("No route for this pair right now");
  });

  it("says when the balance is loading or can't be read", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER }, evmWallet: null };
    mocks.funds = { owner: OWNER, balances: null, loading: true, failed: false };
    const { rerender } = render(<LiveTradePanel token={token} />);
    expect(screen.getByText("Checking balance…")).toBeInTheDocument();
    mocks.funds = { owner: OWNER, balances: null, loading: false, failed: true };
    rerender(<LiveTradePanel token={token} />);
    expect(screen.getByText("Balance unavailable")).toBeInTheDocument();
  });
});
