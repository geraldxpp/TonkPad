import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHAINS } from "../config/chains";
import type { ChainId } from "../types/chain";
import { ChainMark } from "../ui/ChainMark";

describe("ChainMark", () => {
  it.each(Object.keys(CHAINS) as ChainId[])("shows %s's logo, or its letter while there is none", (id) => {
    const { container } = render(<ChainMark chain={id} size={18} letterSize={9} />);
    const mark = screen.getByRole("img", { name: CHAINS[id].name });
    const logo = CHAINS[id].logo;
    if (logo) {
      expect(container.querySelector("img")?.getAttribute("src")).toContain(logo);
      expect(mark).not.toHaveTextContent(CHAINS[id].letter);
    } else {
      expect(container.querySelector("img")).toBeNull();
      expect(mark).toHaveTextContent(CHAINS[id].letter);
    }
    expect(mark).toHaveStyle({ width: "18px", height: "18px" });
  });

  it("hides decorative marks from assistive tech", () => {
    const { container } = render(<ChainMark chain="sol" size={10} decorative />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
