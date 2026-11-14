import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { toSnapshot } from "@/shared/wallet/appkit-state";
import { createStubDriver, STUB_NAME_KEY, STUB_STORAGE_KEY } from "@/shared/wallet/stub-driver";
import { needsSmartTransactionsOff, SmartTransactionsNotice } from "@/shared/wallet/SmartTransactionsNotice";
import type { WalletView } from "@/shared/wallet/wallet";

const mocks = vi.hoisted(() => ({ view: null as WalletView | null }));
vi.mock("@/shared/wallet/wallet", () => ({ useWallet: () => mocks.view }));

const RH = "0x7a5e00000000000000000000000000000000c0de";
const on = (evmWallet: string | null): WalletView => ({ phase: "ready", pending: false, chain: "rh", address: RH, accounts: { rh: RH }, evmWallet });
const show = (chainId: number) =>
  render(
    <I18nProvider lang="en" messages={DICTIONARIES.en}>
      <SmartTransactionsNotice chainId={chainId} />
    </I18nProvider>,
  );

afterEach(() => localStorage.clear());

describe("the MetaMask Smart Transactions notice", () => {
  it("is for MetaMask on Robinhood Chain mainnet only: MetaMask runs no Smart Transactions on the testnet", () => {
    expect(needsSmartTransactionsOff(4663, "MetaMask")).toBe(true);
    expect(needsSmartTransactionsOff(4663, "metamask")).toBe(true);
    expect(needsSmartTransactionsOff(46630, "MetaMask")).toBe(false);
    expect(needsSmartTransactionsOff(4663, "Rabby Wallet")).toBe(false);
    expect(needsSmartTransactionsOff(4663, null)).toBe(false);
  });

  it("tells a MetaMask user to turn Smart Transactions off, and shows nothing to anyone else", () => {
    mocks.view = on("MetaMask");
    const { unmount } = show(4663);
    expect(screen.getByRole("note")).toHaveTextContent("Turn off Smart Transactions first (Settings → Advanced).");
    unmount();
    mocks.view = on("Coinbase Wallet");
    const other = show(4663);
    expect(screen.queryByRole("note")).toBeNull();
    other.unmount();
    mocks.view = on("MetaMask");
    show(46630);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("the connected wallet's name", () => {
  beforeEach(() => localStorage.clear());

  it("comes from AppKit's wallet info, only while Robinhood Chain is connected", () => {
    const base = { initialized: true, open: false, activeNamespace: "eip155" };
    expect(toSnapshot({ ...base, accounts: { solana: undefined, eip155: { isConnected: true, address: RH } }, evmWallet: " MetaMask " }).evmWallet).toBe("MetaMask");
    expect(toSnapshot({ ...base, accounts: { solana: undefined, eip155: undefined }, evmWallet: "MetaMask" }).evmWallet).toBeNull();
    expect(toSnapshot({ ...base, accounts: { solana: undefined, eip155: { isConnected: true, address: RH } } }).evmWallet).toBeNull();
  });

  it("is the e2e stub's chosen name, once it is connected on Robinhood Chain", async () => {
    localStorage.setItem(STUB_NAME_KEY, "MetaMask");
    localStorage.setItem(STUB_STORAGE_KEY, JSON.stringify({ active: "rh", chains: ["rh"] }));
    expect(createStubDriver().snapshot().evmWallet).toBe("MetaMask");
    localStorage.removeItem(STUB_STORAGE_KEY);
    const driver = createStubDriver();
    expect(driver.snapshot().evmWallet).toBeNull();
    await driver.connect("sol");
    expect(driver.snapshot().evmWallet).toBeNull();
    await driver.connect("rh");
    expect(driver.snapshot().evmWallet).toBe("MetaMask");
  });
});
