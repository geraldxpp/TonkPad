import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertMeButton } from "@/shared/alerts/components/AlertMeButton";
import { AlertsBell } from "@/shared/alerts/components/AlertsBell";
import { AlertsHost } from "@/shared/alerts/components/AlertsHost";
import { setAlertsPanel } from "@/shared/alerts/panel";
import { readRules, writeFeed, writeRules } from "@/shared/alerts/storage";
import type { AlertRule, FeedItem } from "@/shared/alerts/types";
import { useAlertsEngine } from "@/shared/alerts/useAlertsEngine";

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

const TOKEN = { address: "PEPE", chain: "sol" as const, symbol: "PEPE", name: "Pepe" };
const item = (id: string): FeedItem => ({ id, at: Date.now() - 120_000, kind: "priceAbove", token: TOKEN, value: 0.002, read: false });
const rule: AlertRule = { id: "r1", token: TOKEN, on: true, armed: true, createdAt: 1, kind: "move", window: "1h", percent: 20 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ prices: [], launches: [] })));
});
afterEach(() => {
  act(() => setAlertsPanel(false));
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the bell and the panel", () => {
  it("shows a count only for unread alerts, and opening the panel reads them", async () => {
    render(<AlertsBell />);
    expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument();
    act(() => writeFeed([item("a"), item("b")]));
    const bell = screen.getByRole("button", { name: "Alerts, 2 new" });
    render(<AlertsHost />);
    fireEvent.click(bell);
    expect(await screen.findAllByText("PEPE rose above $0.00200")).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("button", { name: "Alerts" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Nothing yet. When an alert fires, it shows up here.")).toBeInTheDocument();
  });

  it("lists rules with a switch and Delete, and the launchpad switches on mainnet", () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "mainnet");
    writeRules([rule]);
    render(<AlertsHost />);
    act(() => setAlertsPanel(true));
    fireEvent.click(screen.getByRole("tab", { name: /My alerts/ }));
    const toggle = screen.getByRole("switch", { name: "PEPE: Moves 20% within 1 hour" });
    fireEvent.click(toggle);
    expect(readRules()[0].on).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete alert: PEPE Moves 20% within 1 hour" }));
    expect(readRules()).toEqual([]);
    expect(screen.getByRole("switch", { name: "Every new launch" })).toBeInTheDocument();
  });

  it("says it isn't on testnet yet, and the token page has no bell there", () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_NETWORK", "testnet");
    render(<AlertsHost />);
    act(() => setAlertsPanel(true));
    expect(screen.getByText("Alerts aren't on testnet yet.")).toBeInTheDocument();
    render(<AlertMeButton token={TOKEN} priceUsd={0.001} marketCap={1_000_000} />);
    expect(screen.queryByRole("button", { name: "Set an alert for PEPE" })).toBeNull();
  });
});

describe("Alert me when…", () => {
  it("sets a price alert above the price now, and refuses one that's already met", () => {
    render(<AlertMeButton token={TOKEN} priceUsd={0.001} marketCap={1_000_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Set an alert for PEPE" }));
    const input = screen.getByRole("textbox", { name: "Level in USD" });
    expect(input).toHaveValue("0.0012");
    fireEvent.change(input, { target: { value: "0.0009" } });
    fireEvent.click(screen.getByRole("button", { name: "Set alert" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a level above the current one.");
    fireEvent.change(input, { target: { value: "0.0015" } });
    fireEvent.click(screen.getByRole("button", { name: "Set alert" }));
    expect(readRules()).toMatchObject([{ kind: "price", direction: "above", value: 0.0015, token: TOKEN }]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sets a move alert, and says so when the list is full", () => {
    writeRules(Array.from({ length: 25 }, (_, i) => ({ ...rule, id: `r${i}` })));
    render(<AlertMeButton token={TOKEN} priceUsd={0.001} marketCap={1_000_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Set an alert for PEPE" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByRole("textbox", { name: "Move in percent, either way" })).toHaveValue("20");
    fireEvent.click(screen.getByRole("button", { name: "Set alert" }));
    expect(screen.getByRole("alert")).toHaveTextContent("You have 25 alerts, the most there can be.");
  });
});

describe("one tab checks", () => {
  it("lets only the tab holding the lock check, so nothing fires twice", async () => {
    let held = false;
    const waiting: Array<() => void> = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: {
        request: (_name: string, _options: unknown, grant: () => Promise<void>) => {
          const take = () => {
            held = true;
            return grant().finally(() => {
              held = false;
              waiting.shift()?.();
            });
          };
          return held ? new Promise<void>((resolve) => waiting.push(() => void take().then(resolve))) : take();
        },
      },
    });
    writeRules([rule]);
    const options = { enabled: true, launchpad: false, onFired: () => undefined, onStatus: () => undefined };
    const first = renderHook(() => useAlertsEngine(options));
    renderHook(() => useAlertsEngine(options));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    first.unmount();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
