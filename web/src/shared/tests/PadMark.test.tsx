import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LAUNCHPADS } from "../config/launchpads";
import type { LaunchpadId } from "../types/launchpad";
import { PadMark } from "../ui/PadMark";

describe("PadMark", () => {
  it.each(Object.keys(LAUNCHPADS) as LaunchpadId[])("shows %s's logo, or its letter while there is none", (id) => {
    const { container } = render(<PadMark pad={id} />);
    const mark = screen.getByRole("img", { name: LAUNCHPADS[id].name });
    const logo = LAUNCHPADS[id].logo;
    if (logo) {
      expect(container.querySelector("img")?.getAttribute("src")).toContain(logo);
      expect(mark).not.toHaveTextContent(LAUNCHPADS[id].letter);
    } else {
      expect(container.querySelector("img")).toBeNull();
      expect(mark).toHaveTextContent(LAUNCHPADS[id].letter);
    }
  });

  it("keeps a logo in a fixed square that rows can't stretch (Safari did, from the logo's own size)", () => {
    const { container } = render(<PadMark pad="pons" decorative />);
    expect(container.firstElementChild).toHaveClass("size-4", "flex-none");
    const { container: ringed } = render(<PadMark pad="pons" size={18} ring="var(--surface)" decorative />);
    expect(ringed.firstElementChild).toHaveClass("size-[18px]", "flex-none");
  });

  it("uses the tonkfun.fun mark for its own launchpad", () => {
    const { container } = render(<PadMark pad="tonk" decorative />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/launchpads/tonk.svg");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
