import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

import { ChainFilter } from "../components/ChainFilter";

const counts = { all: 8_412, sol: 5_941, rh: 2_471 };

beforeEach(() => {
  search = new URLSearchParams();
  window.history.replaceState(null, "", "/");
});

function open() {
  render(<ChainFilter counts={counts} />);
  const trigger = screen.getByRole("button", { name: /All Chains/ });
  fireEvent.click(trigger);
  return trigger;
}

describe("ChainFilter", () => {
  it("lists the three chains with their counts as listbox options", () => {
    const trigger = open();
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByRole("option", { name: /^All Chains/ })).toHaveTextContent("8,412");
    expect(screen.getByRole("option", { name: /^Solana/ })).toHaveTextContent("5,941");
    expect(screen.getByRole("option", { name: /^Robinhood Chain/ })).toHaveTextContent("2,471");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("listbox", { name: "Chains" })).toBeInTheDocument();
  });

  it("moves focus to the selected option, then with the arrow keys, Home and End", () => {
    open();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: "End" });
    expect(options[2]).toHaveFocus();
    fireEvent.keyDown(options[2], { key: "ArrowDown" });
    expect(options[0]).toHaveFocus();
    fireEvent.keyDown(options[0], { key: "ArrowUp" });
    expect(options[2]).toHaveFocus();
  });

  it("picks a chain into the URL, closes and returns focus to the pill", () => {
    const trigger = open();
    fireEvent.click(screen.getByRole("option", { name: /Solana/ }));
    expect(window.location.search).toBe("?chain=sol");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus", () => {
    const trigger = open();
    fireEvent.keyDown(screen.getAllByRole("option")[0], { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside", () => {
    open();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the chain from the URL", () => {
    search = new URLSearchParams("chain=rh");
    render(<ChainFilter counts={counts} />);
    expect(screen.getByRole("button", { name: /Robinhood Chain/ })).toBeInTheDocument();
  });
});
