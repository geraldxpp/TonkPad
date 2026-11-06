import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/shared/ui/Tabs";

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
] as const;

function Harness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return <Tabs tabs={TABS} value={value} onChange={setValue} label="Lists" panelId="panel" idPrefix="t" />;
}

describe("Tabs", () => {
  it("has a single tab stop on the selected tab", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-controls", "panel");
    expect(screen.getByRole("tablist", { name: "Lists" })).toBeInTheDocument();
  });

  it("moves and selects with the arrow keys, Home and End", () => {
    render(<Harness />);
    const [alpha, beta, gamma] = screen.getAllByRole("tab");
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(beta).toHaveFocus();
    expect(beta).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(beta, { key: "End" });
    expect(gamma).toHaveFocus();
    fireEvent.keyDown(gamma, { key: "ArrowRight" });
    expect(alpha).toHaveFocus();
    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    expect(gamma).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(gamma, { key: "Home" });
    expect(alpha).toHaveAttribute("aria-selected", "true");
  });

  it("selects on click", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  });
});
