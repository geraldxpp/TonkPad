import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { LaunchReceipt } from "../components/LaunchReceipt";
import type { LaunchTxView } from "../hooks/useLaunchTx";

const en = DICTIONARIES.en;
const HASH = `0x${"ab".repeat(32)}`;
const EXPLORER = "https://explorer.example";
const show = (tx: Partial<LaunchTxView>, onBack = vi.fn()) => {
  const full: LaunchTxView = { state: "unknown", mission: null, unreachable: false, stalled: false, replacedBy: null, notSent: false, ...tx };
  render(
    <I18nProvider lang="en" messages={en}>
      <LaunchReceipt hash={HASH} tx={full} chainName="Robinhood Chain" unit="ETH" explorerUrl={EXPLORER} onBack={onBack} />
    </I18nProvider>,
  );
  return onBack;
};

describe("a launch's receipt while the chain hasn't seen it", () => {
  it("is still confirming at first, with its explorer link and no way back yet", () => {
    show({ state: "unknown" });
    expect(screen.getByRole("heading", { name: en.launch.receipt.pendingTitle })).toBeVisible();
    expect(screen.getByRole("link", { name: en.swap.viewTx })).toHaveAttribute("href", `${EXPLORER}/tx/${HASH}`);
    expect(screen.queryByRole("button", { name: en.launch.receipt.backToStudio })).not.toBeInTheDocument();
  });

  it("says a launch the chain hasn't seen isn't on the chain yet, warns not to launch twice, drops the dead link, and lets the creator go back", () => {
    const onBack = show({ state: "unknown", notSent: true });
    expect(screen.getByRole("heading", { name: en.launch.receipt.notSentTitle })).toBeVisible();
    expect(screen.getByText(en.launch.run.notSent)).toBeVisible();
    expect(screen.queryByText(en.launch.run.failed)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.swap.viewTx })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.launch.receipt.backToStudio }));
    expect(onBack).toHaveBeenCalledWith(false);
  });
});
