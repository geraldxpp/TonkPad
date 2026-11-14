import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletView } from "@/shared/wallet/wallet";
import { WalletPanel } from "../components/WalletPanel";

const SOL = "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv";
const RH = "0x7a5e00000000000000000000000000000000c0de";

const mocks = vi.hoisted(() => ({
  view: null as WalletView | null,
  wallet: {
    load: vi.fn<() => Promise<object | null>>(),
    connect: vi.fn(async () => true),
    switchChain: vi.fn(async () => true),
    disconnect: vi.fn(async () => undefined),
  },
}));

vi.mock("@/shared/wallet/wallet", () => ({
  useWallet: () => mocks.view,
  wallet: mocks.wallet,
}));

const disconnected: WalletView = { phase: "idle", pending: false, chain: null, address: null, accounts: {}, evmWallet: null };
const onSolana: WalletView = { phase: "ready", pending: false, chain: "sol", address: SOL, accounts: { sol: SOL }, evmWallet: null };

beforeEach(() => {
  mocks.view = disconnected;
  mocks.wallet.load.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("WalletPanel", () => {
  it("offers both chains and opens the picker only after closing its container", async () => {
    const onClose = vi.fn();
    render(<WalletPanel onClose={onClose} />);
    expect(screen.getByRole("group", { name: "Connect a wallet" })).toBeInTheDocument();
    expect(screen.getByText("Connecting shares only your address. Nothing is signed.")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connect a Robinhood Chain wallet" })));
    expect(mocks.wallet.load).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mocks.wallet.connect).toHaveBeenCalledWith("rh");
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(mocks.wallet.connect.mock.invocationCallOrder[0]);
  });

  it("says so, and stays open, when the wallet code can't load", async () => {
    mocks.wallet.load.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<WalletPanel onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connect a Solana wallet" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Wallet connection is unavailable right now. Try again later.");
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.wallet.connect).not.toHaveBeenCalled();
  });

  it("shows the connected chain and address, and copies the whole address", async () => {
    mocks.view = onSolana;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<WalletPanel onClose={vi.fn()} />);
    expect(screen.getByText("Connected on Solana")).toBeInTheDocument();
    expect(screen.getByText("FLRe…SuCv")).toHaveAttribute("title", SOL);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy address" })));
    expect(writeText).toHaveBeenCalledWith(SOL);
    expect(screen.getByText("Address copied")).toBeInTheDocument();
  });

  it("connects the other chain too, closing first so the picker is on top", () => {
    mocks.view = onSolana;
    const onClose = vi.fn();
    render(<WalletPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect a Robinhood Chain wallet" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.wallet.switchChain).toHaveBeenCalledWith("rh");
  });

  it("switches in place when both chains are connected", () => {
    mocks.view = { ...onSolana, accounts: { sol: SOL, rh: RH } };
    const onClose = vi.fn();
    render(<WalletPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Robinhood Chain" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.wallet.switchChain).toHaveBeenCalledWith("rh");
  });

  it("disconnects", () => {
    mocks.view = onSolana;
    const onClose = vi.fn();
    render(<WalletPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.wallet.disconnect).toHaveBeenCalled();
  });
});
