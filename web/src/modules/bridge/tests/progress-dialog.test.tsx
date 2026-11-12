import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ProgressDialog } from "../components/ProgressDialog";
import type { RecentTransfer } from "../lib/types";

// jsdom may not open dialogs: enough of showModal and close for the sheet to appear.
beforeAll(() => {
  const dialog = HTMLDialogElement.prototype;
  if (typeof dialog.showModal !== "function") {
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    dialog.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
});

const DROPPED: RecentTransfer = {
  id: "t1",
  from: { network: "sol", symbol: "SOL", amount: "0.004" },
  to: { network: "base", symbol: "ETH", amount: "0.000713" },
  routeName: "Relay",
  sender: "FLRettWhwj1oyn19GMQVF3xdGUtgZft4mRXBHTuWSuCv",
  recipient: "0x1111111111111111111111111111111111111111",
  raw: "4000000",
  tracking: { provider: "relay", requestId: null, tool: null, validUntil: 1_000 },
  sourceTx: "XwezcpfxY3Eszn4sxgkibUGawpox91CqD3YuXK84x95c359GuYuG8W7x3Byqm2pPLXe5C8hyfpRUYFCVTmftZYn",
  destinationTx: null,
  etaSeconds: 30,
  state: "dropped",
  at: 0,
};

describe("the transfer dialog", () => {
  it("says a dropped send was never sent and nothing left the wallet, instead of waiting forever", () => {
    render(<ProgressDialog transfer={DROPPED} now={60_000} onClose={vi.fn()} nextHref={null} nextLabel="" />);
    expect(screen.getByText(en.bridge.progress.dropped)).toBeVisible();
    expect(screen.getByText("Solana dropped the transaction before it landed, so nothing left your wallet. You can send it again.")).toBeVisible();
    // Nothing keeps going: the footer offers Close, not "Close: it keeps going".
    expect(screen.queryByRole("button", { name: en.bridge.progress.keepGoing })).not.toBeInTheDocument();
    expect(screen.queryByText(en.bridge.progress.slow)).not.toBeInTheDocument();
  });
});
