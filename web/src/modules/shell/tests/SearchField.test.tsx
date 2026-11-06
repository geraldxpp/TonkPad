import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

import { SearchField } from "../components/SearchField";

beforeEach(() => {
  search = new URLSearchParams();
  window.history.replaceState(null, "", "/");
});

describe("SearchField", () => {
  it("is labelled and advertises the / shortcut", () => {
    render(<SearchField />);
    const input = screen.getByRole("searchbox", { name: "Search tokens" });
    expect(input).toHaveAttribute("placeholder", "Search token, ticker or CA");
    expect(input).toHaveAttribute("aria-keyshortcuts", "/");
  });

  it("writes the query into ?q= and removes it when cleared", () => {
    render(<SearchField />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "mo" } });
    expect(window.location.search).toBe("?q=mo");
    fireEvent.change(input, { target: { value: "" } });
    expect(window.location.search).toBe("");
  });

  it("focuses on / unless you are already typing somewhere", () => {
    render(
      <>
        <SearchField />
        <textarea aria-label="notes" />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox")).toHaveFocus();

    const notes = screen.getByRole("textbox", { name: "notes" });
    notes.focus();
    fireEvent.keyDown(notes, { key: "/" });
    expect(notes).toHaveFocus();
  });

  it("starts with the query from the URL", () => {
    search = new URLSearchParams("q=ghost");
    render(<SearchField />);
    expect(screen.getByRole("searchbox")).toHaveValue("ghost");
  });
});

describe("SearchField on phones", () => {
  it("folds into a magnifier that opens and focuses the field", () => {
    render(<SearchField />);
    const toggle = screen.getByRole("button", { name: "Search" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "tk-search-box");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("starts open when the URL already has a query", () => {
    search = new URLSearchParams("q=mo");
    render(<SearchField />);
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on / as well", () => {
    render(<SearchField />);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
});
