import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
}));

vi.mock("@/shared/wallet/wallet", () => ({ useWallet: () => mocks.view, wallet: mocks.wallet }));
vi.mock("@/shared/wallet/useWalletBalances", () => ({ useWalletBalances: () => mocks.funds }));

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

const idle: WalletView = { phase: "idle", pending: false, chain: null, address: null, accounts: {} };
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
    mocks.view = { phase: "ready", pending: false, chain: "rh", address: "0x7a5e00000000000000000000000000000000c0de", accounts: { rh: "0x7a5e00000000000000000000000000000000c0de" } };
    render(<LiveTradePanel token={token} />);
    const button = screen.getByRole("button", { name: "Connect a Solana wallet" });
    expect(button).toHaveAccessibleDescription("Connecting shares only your address. Nothing is signed.");
    fireEvent.click(button);
    expect(mocks.wallet.connect).toHaveBeenCalledWith("sol");
  });

  it("shows the real balances and keeps the trade button disabled", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER } };
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

  it("says when the balance is loading or can't be read", () => {
    mocks.view = { phase: "ready", pending: false, chain: "sol", address: OWNER, accounts: { sol: OWNER } };
    mocks.funds = { owner: OWNER, balances: null, loading: true, failed: false };
    const { rerender } = render(<LiveTradePanel token={token} />);
    expect(screen.getByText("Checking balance…")).toBeInTheDocument();
    mocks.funds = { owner: OWNER, balances: null, loading: false, failed: true };
    rerender(<LiveTradePanel token={token} />);
    expect(screen.getByText("Balance unavailable")).toBeInTheDocument();
  });
});
